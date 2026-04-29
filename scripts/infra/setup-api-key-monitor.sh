#!/bin/bash
# ──────────────────────────────────────────────────────────────
# The Spa Synergy — AppSync API Key Expiration Monitor
#
# Creates:
#   1. IAM role for the Lambda
#   2. Lambda function (checks API key expiry daily)
#   3. EventBridge rule (triggers Lambda daily at 9am ET)
#   4. CloudWatch alarm (alerts when key is within 30 days of expiring)
#
# Prerequisites:
#   - AWS CLI configured
#   - The uptime monitoring SNS topic must already exist
#     (run setup-uptime-monitoring.sh first)
#
# Usage:
#   chmod +x scripts/infra/setup-api-key-monitor.sh
#   ./scripts/infra/setup-api-key-monitor.sh
#
# Cost: ~$0.00/month (Lambda free tier: 1M requests, this runs once/day)
# ──────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
REGION="us-east-1"
FUNCTION_NAME="spa-synergy-api-key-monitor"
ROLE_NAME="spa-synergy-api-key-monitor-role"
RULE_NAME="spa-synergy-api-key-check-daily"
ALARM_NAME="spa-synergy-api-key-expiring"
SNS_TOPIC_NAME="spa-synergy-uptime-alerts"
ALARM_THRESHOLD_DAYS=30

# ── Colors ─────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ── Find AppSync API ID ───────────────────────────────────────
echo -e "${YELLOW}Finding AppSync API...${NC}"
APPSYNC_API_ID=$(aws appsync list-graphql-apis \
  --region "$REGION" \
  --query "graphqlApis[?contains(name, 'TheSpaSynergy') || contains(name, 'amplify')].apiId | [0]" \
  --output text 2>/dev/null)

if [ -z "$APPSYNC_API_ID" ] || [ "$APPSYNC_API_ID" = "None" ]; then
  echo -e "${RED}Could not auto-detect AppSync API ID.${NC}"
  echo "List your APIs with: aws appsync list-graphql-apis --region $REGION"
  echo "Then run: APPSYNC_API_ID=<your-api-id> $0"
  exit 1
fi
echo -e "  ${GREEN}✓ Found API: ${APPSYNC_API_ID}${NC}"

# Allow override
APPSYNC_API_ID="${APPSYNC_API_ID:-$APPSYNC_API_ID}"

# ── Find SNS Topic ────────────────────────────────────────────
TOPIC_ARN=$(aws sns list-topics --region "$REGION" \
  --query "Topics[?ends_with(TopicArn, ':${SNS_TOPIC_NAME}')].TopicArn | [0]" \
  --output text)

if [ -z "$TOPIC_ARN" ] || [ "$TOPIC_ARN" = "None" ]; then
  echo -e "${RED}SNS topic '${SNS_TOPIC_NAME}' not found. Run setup-uptime-monitoring.sh first.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓ SNS topic: ${TOPIC_ARN}${NC}"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo ""

# ── 1. Create IAM Role ────────────────────────────────────────
echo "1/4 Creating IAM role..."

TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

ROLE_ARN=$(aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document "$TRUST_POLICY" \
  --query 'Role.Arn' \
  --output text 2>/dev/null || \
  aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

# Attach policies
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" 2>/dev/null || true

INLINE_POLICY='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "appsync:ListApiKeys",
      "Resource": "arn:aws:appsync:'"$REGION"':'"$ACCOUNT_ID"':apis/'"$APPSYNC_API_ID"'"
    },
    {
      "Effect": "Allow",
      "Action": "cloudwatch:PutMetricData",
      "Resource": "*"
    }
  ]
}'

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "api-key-monitor-permissions" \
  --policy-document "$INLINE_POLICY"

echo -e "  ${GREEN}✓ Role: ${ROLE_ARN}${NC}"

# Wait for role propagation
echo "  Waiting for IAM role propagation..."
sleep 10

# ── 2. Create Lambda Function ─────────────────────────────────
echo "2/4 Creating Lambda function..."

# Package the function
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMP_ZIP=$(mktemp /tmp/api-key-monitor-XXXXXX.zip)
rm -f "$TEMP_ZIP"
powershell -Command "Compress-Archive -Path '$SCRIPT_DIR/api-key-monitor/index.js' -DestinationPath '$TEMP_ZIP' -Force" 2>/dev/null || \
  (cd "$SCRIPT_DIR/api-key-monitor" && zip -j "$TEMP_ZIP" index.js > /dev/null && cd - > /dev/null)

# Create or update
aws lambda create-function \
  --function-name "$FUNCTION_NAME" \
  --runtime "nodejs20.x" \
  --role "$ROLE_ARN" \
  --handler "index.handler" \
  --zip-file "fileb://$TEMP_ZIP" \
  --timeout 15 \
  --memory-size 128 \
  --environment "Variables={APPSYNC_API_ID=$APPSYNC_API_ID}" \
  --region "$REGION" > /dev/null 2>&1 || \
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file "fileb://$TEMP_ZIP" \
  --region "$REGION" > /dev/null

rm -f "$TEMP_ZIP"

LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"
echo -e "  ${GREEN}✓ Lambda: ${FUNCTION_NAME}${NC}"

# ── 3. Create EventBridge Rule (daily at 9am ET) ─────────────
echo "3/4 Creating daily schedule..."

aws events put-rule \
  --name "$RULE_NAME" \
  --schedule-expression "cron(0 13 * * ? *)" \
  --state ENABLED \
  --description "Daily check of AppSync API key expiration" \
  --region "$REGION" > /dev/null

# Allow EventBridge to invoke Lambda
aws lambda add-permission \
  --function-name "$FUNCTION_NAME" \
  --statement-id "eventbridge-daily" \
  --action "lambda:InvokeFunction" \
  --principal "events.amazonaws.com" \
  --source-arn "arn:aws:events:${REGION}:${ACCOUNT_ID}:rule/${RULE_NAME}" \
  --region "$REGION" > /dev/null 2>&1 || true

aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "Id=api-key-monitor,Arn=${LAMBDA_ARN}" \
  --region "$REGION" > /dev/null

echo -e "  ${GREEN}✓ Schedule: daily at 9:00 AM ET${NC}"

# ── 4. Create CloudWatch Alarm ────────────────────────────────
echo "4/4 Creating expiration alarm..."

aws cloudwatch put-metric-alarm \
  --alarm-name "$ALARM_NAME" \
  --alarm-description "AppSync API key expires within ${ALARM_THRESHOLD_DAYS} days — redeploy to rotate" \
  --namespace "SpaSynergy" \
  --metric-name "ApiKeyDaysUntilExpiry" \
  --statistic Minimum \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold "$ALARM_THRESHOLD_DAYS" \
  --comparison-operator LessThanOrEqualToThreshold \
  --alarm-actions "$TOPIC_ARN" \
  --treat-missing-data notBreaching \
  --region "$REGION"

echo -e "  ${GREEN}✓ Alarm: ${ALARM_NAME} (triggers at ≤${ALARM_THRESHOLD_DAYS} days)${NC}"
echo ""

# ── Summary ────────────────────────────────────────────────────
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  API key expiration monitor setup complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo "  AppSync API:     ${APPSYNC_API_ID}"
echo "  Lambda:          ${FUNCTION_NAME}"
echo "  Schedule:        Daily at 9:00 AM ET"
echo "  Alarm:           ${ALARM_NAME}"
echo "  Alert threshold: ${ALARM_THRESHOLD_DAYS} days before expiry"
echo "  SNS topic:       ${TOPIC_ARN}"
echo ""
echo "  When the alarm fires, just redeploy in Amplify Console"
echo "  to rotate the API key (365 more days)."
echo ""
echo "  Cost: ~\$0.00/month (Lambda free tier)"
