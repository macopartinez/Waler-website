import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { getCurrentUser, getUserById } from "./auth";

/**
 * Protège les endpoints d'opération (/api/admin/* : démarrage/arrêt des bots et
 * agents). Exige l'en-tête `x-admin-token` égal à process.env.ADMIN_API_TOKEN.
 *
 * En développement, si ADMIN_API_TOKEN n'est pas défini, l'accès reste ouvert
 * pour ne pas casser le workflow local. En production, l'absence de token
 * configuré bloque l'accès (fail-closed).
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_TOKEN;
  const isProd = process.env.NODE_ENV === "production";

  if (!expected) {
    if (isProd) {
      return res.status(503).json({ message: "Admin non configuré" });
    }
    return next(); // dev: pas de token requis
  }

  const provided =
    (req.headers["x-admin-token"] as string | undefined) ||
    (typeof req.query.adminToken === "string" ? req.query.adminToken : undefined);

  if (!provided) {
    return res.status(401).json({ message: "Token admin requis" });
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ message: "Token admin invalide" });
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = getCurrentUser(req);
  
  if (!userId) {
    return res.status(401).json({ message: "Non authentifié" });
  }
  
  next();
}

export function requireVerified(req: Request, res: Response, next: NextFunction) {
  const userId = getCurrentUser(req);
  
  if (!userId) {
    return res.status(401).json({ message: "Non authentifié" });
  }
  
  getUserById(userId).then(user => {
    if (!user) {
      return res.status(401).json({ message: "Utilisateur non trouvé" });
    }
    
    if (!user.isVerified) {
      return res.status(403).json({ 
        message: "Compte non vérifié",
        requiresVerification: true 
      });
    }
    
    next();
  }).catch(err => {
    return res.status(500).json({ message: "Erreur serveur" });
  });
}

/**
 * Bloque les endpoints "opérationnels" de l'extension (sync, analyse, DMs...)
 * si l'abonnement Waler n'est pas actif. Reprend la même convention que
 * /api/extension/validate-token et /api/extension/pro-status :
 *   isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing'
 * Fail-closed : toute erreur (utilisateur introuvable, DB indisponible) bloque
 * l'accès plutôt que de laisser passer un compte non payant.
 */
export function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  const userId = getCurrentUser(req);

  if (!userId) {
    return res.status(401).json({ message: "Non authentifié" });
  }

  getUserById(userId).then(user => {
    if (!user) {
      return res.status(401).json({ message: "Utilisateur non trouvé" });
    }

    const isActive = user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing';
    if (!isActive) {
      return res.status(403).json({
        message: "Abonnement inactif",
        subscriptionInactive: true,
      });
    }

    next();
  }).catch(err => {
    return res.status(500).json({ message: "Erreur serveur" });
  });
}

export function requireOwnership(paramName: string = "userId") {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = getCurrentUser(req);
    const requestedId = Number(req.params[paramName]);
    
    if (!userId) {
      return res.status(401).json({ message: "Non authentifié" });
    }
    
    if (userId !== requestedId) {
      return res.status(403).json({ message: "Accès non autorisé" });
    }
    
    next();
  };
}

/**
 * Verrouillage anti-brute-force par identifiant (email). Complète le rate-limit
 * par IP : après MAX_LOGIN_ATTEMPTS échecs, le compte est bloqué LOCKOUT_MS.
 * Stockage en mémoire (réinitialisé au redémarrage) — suffisant ici, pas de
 * dépendance externe. clearLoginAttempts() est appelé à chaque login réussi.
 */
const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

/** Renvoie le timestamp de fin de blocage (>0 si verrouillé), sinon 0. */
export function getLoginLockout(key: string): number {
  const rec = loginAttempts.get(key.toLowerCase());
  if (rec && rec.lockedUntil > Date.now()) return rec.lockedUntil;
  return 0;
}

export function recordFailedLogin(key: string): void {
  const k = key.toLowerCase();
  const rec = loginAttempts.get(k) ?? { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_LOGIN_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.count = 0; // réarme le compteur après verrouillage
  }
  loginAttempts.set(k, rec);
}

export function clearLoginAttempts(key: string): void {
  loginAttempts.delete(key.toLowerCase());
}

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(maxRequests: number = 5, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    
    const record = rateLimitStore.get(ip);
    
    if (!record || now > record.resetTime) {
      rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (record.count >= maxRequests) {
      return res.status(429).json({ 
        message: "Trop de tentatives. Réessayez dans quelques minutes." 
      });
    }
    
    record.count++;
    next();
  };
}
