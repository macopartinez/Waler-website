# Waler - Setup Guide

## Quick Start

### 1. Initialize Database

```bash
cd server
python init_db.py
```

This will create `waler.db` with all necessary tables.

### 2. Install Dependencies

**Backend:**
```bash
cd server
pip install flask flask-cors werkzeug
```

**Frontend:**
```bash
cd client
npm install
```

### 3. Start Development Servers

**Backend (Terminal 1):**
```bash
cd server
python app.py
```
Server runs on http://localhost:5000

**Frontend (Terminal 2):**
```bash
cd client
npm run dev
```
Client runs on http://localhost:5173 (or configured port)

### 4. Test Registration

1. Go to http://localhost:5000
2. Click "Begin Your Journey"
3. Complete the questionnaire (14 steps)
4. At Step 11, you'll see AI Insights with pricing modal
5. Continue to technical setup:
   - Select platform (Instagram/Facebook)
   - Enter username
   - Enter email
   - Create password (min 6 characters)
6. Click "Start Tracking"

---

## Troubleshooting

### "Erreur d'inscription" Error

**Causes:**
1. **Database not initialized** → Run `python init_db.py`
2. **Email already exists** → Use a different email
3. **Username already taken** → Use a different username
4. **Password too short** → Use at least 6 characters
5. **Backend not running** → Start Flask server

**Check backend logs:**
```bash
cd server
python app.py
```
Look for error messages in the terminal.

### Database Issues

**Reset database:**
```bash
cd server
rm waler.db
python init_db.py
```

**Check tables:**
```bash
sqlite3 waler.db
.tables
.schema users
.quit
```

### Port Conflicts

**Backend (Flask):**
Edit `server/app.py` and change port:
```python
app.run(debug=True, port=5001)  # Change from 5000
```

**Frontend (Vite):**
Edit `client/vite.config.ts`:
```ts
export default defineConfig({
  server: {
    port: 3000  // Change from 5173
  }
})
```

---

## Environment Variables

Create `.env` file in root directory:

```env
# Flask
SECRET_KEY=your-secret-key-here
DATABASE_URL=sqlite:///waler.db

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...

# Instagram/Facebook API (optional for now)
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...

# App URLs
CLIENT_URL=http://localhost:5173
```

---

## Project Structure

```
Waler/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   │   ├── pro/       # Pro features (client management)
│   │   │   └── questionnaire/
│   │   ├── contexts/      # React contexts (Auth, Subscription)
│   │   ├── hooks/         # Custom hooks
│   │   ├── pages/         # Main pages (Landing, Dashboard, Onboard)
│   │   └── config/        # Pricing config
│   └── package.json
│
├── server/                # Flask backend
│   ├── routes/           # API routes
│   │   ├── auth.py       # Authentication
│   │   ├── clients.py    # Client management (Pro)
│   │   └── subscription.py # Stripe integration
│   ├── init_db.py        # Database initialization
│   ├── init_db.sql       # Database schema
│   ├── waler.db          # SQLite database (created by init_db.py)
│   └── app.py            # Main Flask app
│
├── context.md            # Product documentation
├── STRIPE_SETUP.md       # Stripe configuration guide
└── SETUP.md              # This file
```

---

## Features

### ✅ Implemented

**Onboarding:**
- 14-step introspection questionnaire
- AI insights with conversion wall (Step 11)
- Technical setup (platform, username, email, password)

**Monetization:**
- Premium plan ($9.99/month, 7-day trial)
- Pro plan ($29.99/month, 14-day trial)
- Pricing modal with Stripe integration
- Subscription context

**Dashboard:**
- Personal mode (followers/unfollowers tracking)
- Professional mode (client management) - Pro only
- Mode switcher
- Pro/Premium badge

**Pro Features:**
- Client management dashboard
- Add/Edit/Delete clients
- Client detail view with graphs
- Session notes
- Milestones tracker
- 30-day growth charts

### 🔜 To Implement

**Backend:**
- Instagram/Facebook API integration
- Automated metrics refresh (cron job)
- Stripe webhook handlers
- Email notifications

**Frontend:**
- RevealGate before showing unfollowers
- Real-time notifications
- Export reports (PDF)
- Coach marketplace

---

## Testing

### Test User Registration

1. Start both servers
2. Go to `/onboard`
3. Complete questionnaire
4. Register with:
   - Username: `testuser`
   - Email: `test@example.com`
   - Password: `password123`
   - Platform: Instagram

### Test Pro Features

1. Manually set user to Pro in database:
```bash
sqlite3 server/waler.db
UPDATE users SET subscription_tier = 'pro', subscription_status = 'active' WHERE email = 'test@example.com';
.quit
```

2. Refresh dashboard
3. Toggle to "Professional" mode
4. Add test clients

---

## Common Commands

**Check database:**
```bash
sqlite3 server/waler.db "SELECT * FROM users;"
```

**Clear sessions:**
```bash
rm -rf server/flask_session/
```

**Rebuild frontend:**
```bash
cd client
npm run build
```

**Run tests:**
```bash
cd client
npm test
```

---

## Support

For issues or questions:
1. Check console logs (browser + terminal)
2. Verify database is initialized
3. Ensure both servers are running
4. Check `context.md` for product documentation

---

Last updated: 2026-04-11
