// Run this script to enable SMS alerts for your vendor account
// Usage: node scripts/enable-sms-alerts.js

import { generateClient } from 'aws-amplify/data';
import { Amplify } from 'aws-amplify';
import config from '../amplify_outputs.json' assert { type: 'json' };

Amplify.configure(config);
const client = generateClient();

async function enableSMSAlerts() {
  try {
    // Get all vendors
    const { data: vendors } = await client.models.Vendor.list();
    
    if (!vendors || vendors.length === 0) {
      console.log('No vendors found');
      return;
    }

    console.log('Found vendors:', vendors.map(v => ({ id: v.vendorId, name: v.name })));
    
    // Update the first vendor with SMS settings
    const vendor = vendors[0];
    
    await client.models.Vendor.update({
      vendorId: vendor.vendorId,
      smsAlertPhone: '2403670395',
      smsAlertsEnabled: true
    });

    console.log(`✅ SMS alerts enabled for ${vendor.name}`);
    console.log(`   Phone: 2403670395`);
    console.log(`   Vendor ID: ${vendor.vendorId}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

enableSMSAlerts();
