# Stripe Setup Guide for Waler

## 1. Create Stripe Account
1. Go to https://stripe.com
2. Create an account
3. Complete business verification

## 2. Create Products & Prices

### Premium Plan
1. Go to **Products** in Stripe Dashboard
2. Click **Add Product**
3. Fill in:
   - **Name**: Waler Premium
   - **Description**: Individual relationship clarity tool
   - **Pricing**: $4.99/month (recurring)
   - **Trial period**: 7 days
4. Copy the **Price ID** (starts with `price_...`)
5. Add to `.env`: `STRIPE_PREMIUM_PRICE_ID=price_xxx`

### Pro Plan
1. Click **Add Product** again
2. Fill in:
   - **Name**: Waler Pro
   - **Description**: For coaches and mentors
   - **Pricing**: $14.99/month (recurring)
   - **Trial period**: 14 days
3. Copy the **Price ID**
4. Add to `.env`: `STRIPE_PRO_PRICE_ID=price_xxx`

## 3. Get API Keys

### Test Mode (Development)
1. Go to **Developers** → **API Keys**
2. Copy **Publishable key** (starts with `pk_test_...`)
3. Copy **Secret key** (starts with `sk_test_...`)
4. Add to `.env`:
   ```
   STRIPE_PUBLISHABLE_KEY=pk_test_xxx
   STRIPE_SECRET_KEY=sk_test_xxx
   ```

### Live Mode (Production)
1. Toggle to **Live mode** in dashboard
2. Repeat steps above with live keys
3. Update `.env` for production

## 4. Set Up Webhooks

### Local Development (with Stripe CLI)
1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Login: `stripe login`
3. Forward events: `stripe listen --forward-to localhost:5000/api/subscription/webhook`
4. Copy the webhook signing secret (starts with `whsec_...`)
5. Add to `.env`: `STRIPE_WEBHOOK_SECRET=whsec_xxx`

### Production
1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Enter URL: `https://yourdomain.com/api/subscription/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret**
6. Add to production `.env`

## 5. Environment Variables

Create/update `.env` file:

```env
# Stripe Keys
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Stripe Price IDs
STRIPE_PREMIUM_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx

# App URLs
CLIENT_URL=http://localhost:5000
```

## 6. Test the Integration

### Test Cards (Test Mode Only)
- **Success**: `4242 4242 4242 4242`
- **Decline**: `4000 0000 0000 0002`
- **3D Secure**: `4000 0025 0000 3155`

Use any future expiry date and any CVC.

### Test Flow
1. Start app: `npm run dev`
2. Complete questionnaire to Step 11
3. Click "Unlock Full Analysis"
4. Select a plan
5. Use test card `4242 4242 4242 4242`
6. Complete checkout
7. Verify webhook received in Stripe CLI
8. Check user subscription status in database

## 7. Production Checklist

Before going live:
- [ ] Switch to Live mode API keys
- [ ] Update webhook endpoint to production URL
- [ ] Test with real card (small amount)
- [ ] Set up email receipts in Stripe
- [ ] Configure tax settings (if applicable)
- [ ] Set up billing portal for customers
- [ ] Enable fraud detection (Stripe Radar)
- [ ] Set up subscription emails (trial ending, payment failed, etc.)

## 8. Monitoring

### Stripe Dashboard
- Monitor subscriptions in **Customers** tab
- Check failed payments in **Payments** tab
- View webhook logs in **Developers** → **Webhooks**

### Key Metrics to Watch
- Trial conversion rate
- Churn rate
- Failed payment rate
- Average subscription lifetime

## 9. Customer Portal (Optional)

Allow users to manage their subscription:

```python
# In your backend
portal_session = stripe.billing_portal.Session.create(
    customer=customer_id,
    return_url='https://yourdomain.com/dashboard',
)
return redirect(portal_session.url)
```

This lets users:
- Update payment method
- Cancel subscription
- View invoices
- Update billing info

## 10. Troubleshooting

### Webhook not receiving events
- Check webhook URL is correct
- Verify signing secret matches
- Check firewall/CORS settings
- Use Stripe CLI for local testing

### Payment fails
- Check API keys are correct
- Verify price IDs match
- Check customer email is valid
- Review Stripe logs for errors

### Trial not working
- Verify trial period set on price
- Check subscription_data in checkout session
- Review customer subscription in dashboard

## Support

- Stripe Docs: https://stripe.com/docs
- Stripe Support: https://support.stripe.com
- Waler Issues: [Your GitHub repo]
