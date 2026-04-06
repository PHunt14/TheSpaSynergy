# Payment Service

Standalone microservice extracted from the Next.js monolith. Handles all Square payment processing, OAuth, and webhooks.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/payment` | Process single or bundle payment |
| GET | `/square/connect` | Initiate Square OAuth |
| GET | `/square/callback` | Square OAuth callback |
| POST | `/square/disconnect` | Revoke Square tokens |
| POST | `/webhooks/square` | Square webhook receiver |

## Setup

```bash
cd services/payment-service
npm install
cp .env.example .env
```

Edit `.env` with your Square credentials and DynamoDB table names.

### Finding your DynamoDB table names

```bash
aws dynamodb list-tables --query "TableNames" --output text
```

Look for tables matching `Vendor-*`, `StaffSchedule-*`, and `Appointment-*`.

## Run

```bash
npm run dev    # with --watch auto-restart
npm start      # production
```

The service runs on `http://localhost:3001` by default.

## Testing

```bash
# Health check
curl http://localhost:3001/health

# Single payment (use Square sandbox nonce)
curl -X POST http://localhost:3001/payment \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"cnon:card-nonce-ok","amount":25.00,"vendorId":"YOUR_VENDOR_ID"}'

# Bundle payment
curl -X POST http://localhost:3001/payment \
  -H "Content-Type: application/json" \
  -d '{"sourceId":"cnon:card-nonce-ok","amount":100.00,"bundlePayments":[{"vendorId":"v1","amount":60},{"vendorId":"v2","amount":40}]}'
```

## Switching the Next.js app to use this service

Set an env var in the Next.js app to point payment calls here:

```
NEXT_PUBLIC_PAYMENT_SERVICE_URL=http://localhost:3001
```

Then update frontend fetch calls from `/api/payment` to `${NEXT_PUBLIC_PAYMENT_SERVICE_URL}/payment`.

## Future

- Deploy behind API Gateway + Lambda (via `@vendia/serverless-express` or container)
- Add token refresh cron/scheduled task
- Add request validation middleware (e.g. zod)
