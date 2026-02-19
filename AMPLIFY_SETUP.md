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
- Choose repository: `PHunt14/alpha-environ`
- Select branch: `dev`
- App name: `alpha-environ-dev`

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
In Amplify Console → Environment variables, add:
- `AWS_REGION`: `us-east-1`
- Any other env vars from `.env.local.example`

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
