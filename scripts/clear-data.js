import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import config from '../amplify_outputs.json' with { type: 'json' };

Amplify.configure(config);
const client = generateClient();

async function clearData() {
  console.log('Clearing vendors...');
  const vendors = await client.models.Vendor.list();
  for (const vendor of vendors.data) {
    await client.models.Vendor.delete({ id: vendor.id });
    console.log(`✓ Deleted vendor: ${vendor.name}`);
  }

  console.log('\nClearing services...');
  const services = await client.models.Service.list();
  for (const service of services.data) {
    await client.models.Service.delete({ id: service.id });
    console.log(`✓ Deleted service: ${service.name}`);
  }

  console.log('\nClearing appointments...');
  const appointments = await client.models.Appointment.list();
  for (const appointment of appointments.data) {
    await client.models.Appointment.delete({ id: appointment.id });
    console.log(`✓ Deleted appointment: ${appointment.appointmentId}`);
  }

  console.log('\n✅ All data cleared!');
}

clearData().catch(console.error);
