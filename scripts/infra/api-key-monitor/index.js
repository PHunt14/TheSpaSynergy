const { AppSyncClient, ListApiKeysCommand } = require('@aws-sdk/client-appsync');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

const appsync = new AppSyncClient({});
const cloudwatch = new CloudWatchClient({});

exports.handler = async () => {
  const apiId = process.env.APPSYNC_API_ID;
  if (!apiId) throw new Error('APPSYNC_API_ID not set');

  const { apiKeys } = await appsync.send(new ListApiKeysCommand({ apiId }));
  if (!apiKeys || apiKeys.length === 0) {
    console.log('No API keys found');
    return;
  }

  // Find the key with the latest expiration (the active one)
  const activeKey = apiKeys.reduce((latest, key) =>
    key.expires > (latest?.expires || 0) ? key : latest, null);

  const now = Math.floor(Date.now() / 1000);
  const daysUntilExpiry = Math.floor((activeKey.expires - now) / 86400);

  console.log(`API key expires in ${daysUntilExpiry} days (${new Date(activeKey.expires * 1000).toISOString()})`);

  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'SpaSynergy',
    MetricData: [{
      MetricName: 'ApiKeyDaysUntilExpiry',
      Value: daysUntilExpiry,
      Unit: 'Count',
    }],
  }));

  return { daysUntilExpiry };
};
