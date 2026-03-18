# AWS Amplify Setup Instructions

## Prerequisites
- AWS Account with appropriate permissions
- GitHub repository connected to AWS Amplify

## Environment Strategy
- **dev**: Active environment, deploys from `dev` branch
- **prod**: Disabled for now, will deploy from `main` branch when ready

## Setup Steps

### 1. Create Dev Branch
```bash
git checkout -b dev
git push -u origin dev
```

### 2. Connect GitHub Repository to Amplify
- Go to AWS Amplify Console
- Click "New app" → "Host web app"
- Select GitHub and authorize
- Choose repository: `PHunt14/TheSpaSynergy`
- Select branch: `dev`
- App name: `TheSpaSynergy-dev`

### 3. Configure Build Settings
The `amplify.yml` file is already configured. Amplify will detect it automatically.

### 4. Add IAM Permissions to Amplify Service Role
Your Amplify service role needs CloudFormation and DynamoDB permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:DescribeStackResources",
        "cloudformation:GetTemplate",
        "cloudformation:ValidateTemplate"
      ],
      "Resource": "arn:aws:cloudformation:us-east-1:*:stack/spa-booking-tables-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:UpdateTable",
        "dynamodb:DescribeTable",
        "dynamodb:ListTables",
        "dynamodb:TagResource"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/spa-vendors-*",
        "arn:aws:dynamodb:us-east-1:*:table/spa-services-*",
        "arn:aws:dynamodb:us-east-1:*:table/spa-appointments-*"
      ]
    }
  ]
}
```

### 5. Add Policy via Console
1. Go to Amplify Console → Your App → App Settings → General
2. Find "Service role" section
3. Click on the role name (opens IAM)
4. Click "Add permissions" → "Create inline policy"
5. Paste the JSON above
6. Name it: `AmplifyCloudFormationDeploy`

### 6. Configure Environment Variables

In Amplify Console → App Settings → Environment variables, add all variables from `.env.local.example`.

**Required for production:**

| Variable | Value | Notes |
|----------|-------|-------|
| `AWS_REGION` | `us-east-1` | |
| `SES_FROM_EMAIL` | `noreply@thespasynergy.com` | Must be verified in SES |
| `SMS_PROVIDER` | `sns` | |
| `SNS_ORIGINATION_NUMBER` | `+1XXXXXXXXXX` | Your registered toll-free or 10DLC number |
| `EMAIL_PROVIDER` | `ses` | |
| `SQUARE_ACCESS_TOKEN` | `EAAA...` | Platform (Kera's) production token |
| `NEXT_PUBLIC_SQUARE_APPLICATION_ID` | `sq0idp-...` | Production Square app ID |
| `NEXT_PUBLIC_SQUARE_LOCATION_ID` | Your location ID | |
| `NEXT_PUBLIC_SQUARE_ENVIRONMENT` | `production` | |
| `NEXT_PUBLIC_APP_URL` | `https://yourdomain.com` | Used for OAuth callbacks |

**Do NOT set in production:** `SMS_TEST_PHONE`, `EMAIL_TEST_ADDRESS`, `TWILIO_*` vars, `SMS_PROVIDER=console`/`twilio`

See `docs/NOTIFICATIONS_SETUP.md` for notification variable details and `SQUARE_SETUP.md` for Square variable details.

### 7. Deploy Dev Environment
```bash
git add .
git commit -m "Setup dev/prod environments"
git push origin dev
```

Amplify will automatically:
1. Deploy CloudFormation stack: `spa-booking-tables-dev`
2. Create tables: `spa-vendors-dev`, `spa-services-dev`, `spa-appointments-dev`
3. Build and deploy Next.js app

## Verify Dev Deployment
```bash
aws cloudformation describe-stacks --stack-name spa-booking-tables-dev --region us-east-1
aws dynamodb list-tables --region us-east-1 | grep dev
```

## When Ready for Prod
1. In Amplify Console, click "Connect branch"
2. Select `main` branch
3. Prod will create: `spa-booking-tables-prod` and `spa-*-prod` tables

## Environment Isolation
- Dev: `spa-*-dev` tables
- Prod: `spa-*-prod` tables (when enabled)
- Separate CloudFormation stacks
- Separate Amplify deployments
