#!/bin/bash
# ──────────────────────────────────────────────────────────────
# The Spa Synergy — Uptime Monitoring Setup
#
# Creates:
#   1. SNS topic + email/SMS subscriptions for alerts
#   2. Route 53 health check (HTTPS, 30s interval)
#   3. CloudWatch alarm on health check failure
#   4. CloudWatch dashboard with uptime, latency, error metrics
#
# Prerequisites:
#   - AWS CLI configured with appropriate permissions
#   - Route 53, CloudWatch, SNS access
#
# Usage:
#   chmod +x scripts/infra/setup-uptime-monitoring.sh
#   ./scripts/infra/setup-uptime-monitoring.sh
#
# Cost: ~$3.75/month
#   - Route 53 health check: $0.75/month
#   - CloudWatch dashboard: $3.00/month
#   - SNS email: free, SMS: ~$0.01/msg
# ──────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ──────────────────────────────────────────────
SITE_URL="www.thespasynergy.com"
SITE_PATH="/"
ALERT_EMAIL="patrick@fortinbras.net"
ALERT_PHONE="+12403670395"  # E.164 format: +12401234567
HEALTH_CHECK_NAME="spa-synergy-production"
SNS_TOPIC_NAME="spa-synergy-uptime-alerts"
DASHBOARD_NAME="SpasynergyUptime"
# Route 53 health checks + alarms must be in us-east-1
REGION="us-east-1"

# ── Colors ─────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Setting up uptime monitoring for ${SITE_URL}...${NC}"
echo ""

# ── 1. Create SNS Topic ───────────────────────────────────────
echo "1/4 Creating SNS topic..."
TOPIC_ARN=$(aws sns create-topic \
  --name "$SNS_TOPIC_NAME" \
  --region "$REGION" \
  --query 'TopicArn' \
  --output text)
echo -e "  ${GREEN}✓ Topic: ${TOPIC_ARN}${NC}"

# Subscribe email
aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol email \
  --notification-endpoint "$ALERT_EMAIL" \
  --region "$REGION" \
  --output text > /dev/null
echo -e "  ${GREEN}✓ Email subscription: ${ALERT_EMAIL} (check inbox to confirm)${NC}"

# Subscribe SMS
aws sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol sms \
  --notification-endpoint "$ALERT_PHONE" \
  --region "$REGION" \
  --output text > /dev/null
echo -e "  ${GREEN}✓ SMS subscription: ${ALERT_PHONE}${NC}"
echo ""

# ── 2. Create Route 53 Health Check ───────────────────────────
echo "2/4 Creating Route 53 health check..."
HEALTH_CHECK_ID=$(aws route53 create-health-check \
  --caller-reference "$(date +%s)-${HEALTH_CHECK_NAME}" \
  --health-check-config '{
    "FullyQualifiedDomainName": "'"$SITE_URL"'",
    "ResourcePath": "'"$SITE_PATH"'",
    "Port": 443,
    "Type": "HTTPS",
    "RequestInterval": 30,
    "FailureThreshold": 3,
    "EnableSNI": true,
    "MeasureLatency": true,
    "Regions": ["us-east-1", "us-west-1", "us-west-2", "eu-west-1", "ap-southeast-1"]
  }' \
  --query 'HealthCheck.Id' \
  --output text)
echo -e "  ${GREEN}✓ Health check: ${HEALTH_CHECK_ID}${NC}"

# Tag the health check (required for CloudWatch to show a friendly name)
aws route53 change-tags-for-resource \
  --resource-type healthcheck \
  --resource-id "$HEALTH_CHECK_ID" \
  --add-tags Key=Name,Value="$HEALTH_CHECK_NAME"
echo -e "  ${GREEN}✓ Tagged: ${HEALTH_CHECK_NAME}${NC}"
echo ""

# ── 3. Create CloudWatch Alarm ────────────────────────────────
echo "3/4 Creating CloudWatch alarm..."
aws cloudwatch put-metric-alarm \
  --alarm-name "${HEALTH_CHECK_NAME}-down" \
  --alarm-description "Alert when ${SITE_URL} is unreachable" \
  --namespace "AWS/Route53" \
  --metric-name "HealthCheckStatus" \
  --dimensions "Name=HealthCheckId,Value=${HEALTH_CHECK_ID}" \
  --statistic Minimum \
  --period 60 \
  --evaluation-periods 2 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --alarm-actions "$TOPIC_ARN" \
  --ok-actions "$TOPIC_ARN" \
  --treat-missing-data breaching \
  --region "$REGION"
echo -e "  ${GREEN}✓ Alarm: ${HEALTH_CHECK_NAME}-down${NC}"
echo -e "  Triggers after 2 consecutive failures (2 min)"
echo -e "  Sends recovery notification when site comes back"
echo ""

# ── 4. Create CloudWatch Dashboard ────────────────────────────
echo "4/4 Creating CloudWatch dashboard..."

DASHBOARD_BODY=$(cat <<EOF
{
  "widgets": [
    {
      "type": "metric",
      "x": 0, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Uptime (Health Check Status)",
        "metrics": [
          ["AWS/Route53", "HealthCheckStatus", "HealthCheckId", "${HEALTH_CHECK_ID}", {"stat": "Minimum", "label": "Healthy (1=up, 0=down)"}]
        ],
        "period": 300,
        "view": "timeSeries",
        "region": "us-east-1",
        "yAxis": {"left": {"min": 0, "max": 1}}
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 0, "width": 12, "height": 6,
      "properties": {
        "title": "Uptime Percentage (30-day)",
        "metrics": [
          ["AWS/Route53", "HealthCheckPercentageHealthy", "HealthCheckId", "${HEALTH_CHECK_ID}", {"stat": "Average", "label": "% Healthy"}]
        ],
        "period": 86400,
        "view": "singleValue",
        "region": "us-east-1"
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "Response Time (ms)",
        "metrics": [
          ["AWS/Route53", "TimeToFirstByte", "HealthCheckId", "${HEALTH_CHECK_ID}", {"stat": "Average", "label": "Avg"}],
          ["AWS/Route53", "TimeToFirstByte", "HealthCheckId", "${HEALTH_CHECK_ID}", {"stat": "p95", "label": "p95"}]
        ],
        "period": 300,
        "view": "timeSeries",
        "region": "us-east-1"
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 6, "width": 12, "height": 6,
      "properties": {
        "title": "Connection Time (ms)",
        "metrics": [
          ["AWS/Route53", "ConnectionTime", "HealthCheckId", "${HEALTH_CHECK_ID}", {"stat": "Average", "label": "Avg"}],
          ["AWS/Route53", "ConnectionTime", "HealthCheckId", "${HEALTH_CHECK_ID}", {"stat": "p95", "label": "p95"}]
        ],
        "period": 300,
        "view": "timeSeries",
        "region": "us-east-1"
      }
    },
    {
      "type": "metric",
      "x": 0, "y": 12, "width": 12, "height": 6,
      "properties": {
        "title": "SSL/TLS Handshake Time (ms)",
        "metrics": [
          ["AWS/Route53", "SSLHandshakeTime", "HealthCheckId", "${HEALTH_CHECK_ID}", {"stat": "Average", "label": "Avg"}]
        ],
        "period": 300,
        "view": "timeSeries",
        "region": "us-east-1"
      }
    },
    {
      "type": "metric",
      "x": 12, "y": 12, "width": 12, "height": 6,
      "properties": {
        "title": "Health Checkers Reporting Healthy",
        "metrics": [
          ["AWS/Route53", "HealthCheckPercentageHealthy", "HealthCheckId", "${HEALTH_CHECK_ID}", {"stat": "Average", "label": "% of checkers healthy"}]
        ],
        "period": 300,
        "view": "timeSeries",
        "region": "us-east-1",
        "yAxis": {"left": {"min": 0, "max": 100}}
      }
    }
  ]
}
EOF
)

aws cloudwatch put-dashboard \
  --dashboard-name "$DASHBOARD_NAME" \
  --dashboard-body "$DASHBOARD_BODY" \
  --region "$REGION"
echo -e "  ${GREEN}✓ Dashboard: ${DASHBOARD_NAME}${NC}"
echo ""

# ── Summary ────────────────────────────────────────────────────
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Uptime monitoring setup complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════${NC}"
echo ""
echo "  SNS Topic:      ${TOPIC_ARN}"
echo "  Health Check:    ${HEALTH_CHECK_ID}"
echo "  Alarm:           ${HEALTH_CHECK_NAME}-down"
echo "  Dashboard:       https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=${DASHBOARD_NAME}"
echo ""
echo -e "${YELLOW}  ACTION REQUIRED:${NC}"
echo "  1. Check your email (${ALERT_EMAIL}) and confirm the SNS subscription"
echo "  2. Replace REPLACE_WITH_YOUR_EMAIL and REPLACE_WITH_YOUR_PHONE in this script with real values if you haven't"
echo ""
echo "  Monthly cost: ~\$3.75"
echo "    Route 53 health check: \$0.75 (with latency measurement)"
echo "    CloudWatch dashboard:  \$3.00"
echo "    SNS alerts:            ~\$0.01/alert (SMS)"
