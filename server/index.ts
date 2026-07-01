import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// esbuild ne polyfille PAS `import.meta.dirname` pour le format CJS (bundle de
// prod) : la propriété reste `undefined`, ce qui casse tous les chemins vers
// waler.db. `__dirname` existe nativement dans le bundle CJS de prod, et à
// défaut (ESM, dev via tsx) on retombe sur `import.meta.url`.
const moduleDir =
  typeof __dirname !== "undefined" ? __dirname : path.dirname(fileURLToPath(import.meta.url));

declare module "express-session" {
  interface SessionData {
    userId: number; // login owner (inchangé)
    activeAccountId?: number; // multi-compte : compte Insta actif (app_users.id)
  }
}

const app = express();
const httpServer = createServer(app);

// Derrière le proxy Railway : nécessaire pour que le cookie `secure` soit posé
// (X-Forwarded-Proto) et que req.ip = vraie IP client (rate-limit fiable).
app.set("trust proxy", 1);

// Ne pas divulguer la stack technique.
app.disable("x-powered-by");

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// En-têtes de sécurité (équivalent Helmet, sans dépendance). Volontairement SANS
// CSP/COOP/COEP/CORP pour ne casser ni le front React/Vite, ni les pages inline
// (extension-auth), ni le chargement d'images cross-origin (avatars Instagram).
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY"); // anti-clickjacking
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  // HSTS uniquement si la requête est en HTTPS (ignoré par le navigateur en dev http).
  if (req.secure) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

app.use(
  express.json({
    // Relevé de 100kb (défaut) à 15mb pour ne pas casser les gros syncs de
    // followers depuis l'extension, tout en bornant contre un body abusif.
    limit: "15mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "15mb" }));

// PostgreSQL session store for persistent sessions
const PgStore = connectPgSimple(session);
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// En production, refuser de démarrer sans SESSION_SECRET : sinon les cookies de
// session seraient signés avec un secret public et donc forgeables (usurpation
// de n'importe quel utilisateur).
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET doit être défini en production");
}

// En production, refuser de démarrer sans DM_ENCRYPTION_KEY : les contenus de
// messages DM sont chiffrés au repos (AES-256). Sans clé dédiée, ils seraient
// chiffrés avec une clé de dev publique — donc déchiffrables par un attaquant.
if (process.env.NODE_ENV === "production" && !process.env.DM_ENCRYPTION_KEY) {
  throw new Error("DM_ENCRYPTION_KEY doit être défini en production");
}

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: new PgStore({
      pool: pgPool,
      tableName: 'session', // Table will be auto-created
      createTableIfMissing: true,
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: "lax",
    },
  })
);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // On ne logge plus le corps JSON des réponses : il contenait des données
      // sensibles (codes de vérification, infos perso, statut d'abonnement).
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // Init des tables de classification (contact_scores, classification_*) dans
  // waler.db si absentes — sinon analyze-contact échoue (INSERT sur table
  // inexistante) et les scores ne sont jamais persistés. Idempotent.
  try {
    const walerDbPath = path.join(moduleDir, "waler.db");
    // NB: en production, index.ts est bundlé dans dist/index.cjs et moduleDir
    // pointe alors vers "dist/", pas "server/". On repasse par "../server/..."
    // pour retomber sur le bon fichier dans les deux cas (en dev, moduleDir
    // finit déjà par "server", donc "../server" revient au même dossier).
    const initSqlPath = path.join(moduleDir, "..", "server", "init_classification_tables.sql");
    const initSql = fs.readFileSync(initSqlPath, "utf8");
    const sqlite = new Database(walerDbPath);
    sqlite.exec(initSql);
    sqlite.close();
    log("✅ Tables de classification vérifiées/créées (waler.db)");
  } catch (e) {
    console.error("⚠️ Init tables de classification échouée:", e);
  }

  // Init des tables des agents Pro (circle_members, liked_posts,
  // timeline_events...) dans waler.db si absentes — sinon l'ajout d'un People
  // échoue (INSERT sur table inexistante) avec des 500 en cascade sur
  // /api/pro/analyze-person, /api/pro/circle-stats et /api/pro/people-suggestions.
  // Idempotent (CREATE TABLE IF NOT EXISTS).
  try {
    const walerDbPath = path.join(moduleDir, "waler.db");
    const proTablesSqlPath = path.join(moduleDir, "..", "migrations", "add_pro_agent_tables.sql");
    const proTablesSql = fs.readFileSync(proTablesSqlPath, "utf8");
    const sqlite = new Database(walerDbPath);
    sqlite.exec(proTablesSql);
    sqlite.close();
    log("✅ Tables des agents Pro vérifiées/créées (waler.db)");
  } catch (e) {
    console.error("⚠️ Init tables des agents Pro échouée:", e);
  }

  await registerRoutes(httpServer, app, pgPool);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    console.error("Internal Server Error:", err);

    // En prod, ne pas divulguer le détail interne de l'erreur au client.
    const message =
      process.env.NODE_ENV === "production"
        ? "Erreur serveur"
        : err.message || "Internal Server Error";

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, () => {
    log(`serving on port ${port}`);
  });
})();
