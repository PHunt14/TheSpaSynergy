import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';
import { sendSms } from '@/lib/sms';
import { sendCustomerBookingEmail, sendVendorBookingEmail } from '@/lib/email';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vendorId, serviceId, bundleId, dateTime, customer, status, paymentId, staffId } = body;

    if (!vendorId || !serviceId || !dateTime || !customer) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const appointmentId = randomUUID();

    const { data, errors } = await client.models.Appointment.create({
      appointmentId,
      vendorId,
      serviceId,
      staffId: staffId || undefined,
      bundleId: bundleId || undefined,
      dateTime,
      customer: JSON.stringify(customer),
      status: status || 'pending',
      paymentId,
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      console.error('Error creating appointment:', errors);
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    // Fetch service + vendor + staff details for notifications
    let serviceName = 'your service';
    let serviceDuration = 0;
    let servicePrice = 0;
    let vendorName = '';
    let vendorEmail = '';
    let staffName = '';
    try {
      const [serviceRes, vendorRes] = await Promise.all([
        client.models.Service.get({ serviceId }),
        client.models.Vendor.get({ vendorId }),
      ]);
      if (serviceRes.data?.name) serviceName = serviceRes.data.name;
      serviceDuration = serviceRes.data?.duration || 0;
      servicePrice = serviceRes.data?.price || 0;
      vendorName = vendorRes.data?.name || '';
      vendorEmail = vendorRes.data?.email || '';
      
      // Resolve the staff member performing the service
      if (staffId) {
        const staffRes = await client.models.StaffSchedule.get({ visibleId: staffId });
        staffName = staffRes.data?.staffName || '';
      }
      if (!staffName) {
        // No staffId provided — find who's assigned for this vendor
        const { data: staffList } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId });
        const activeStaff = (staffList || []).filter(s => s.isActive);
        if (activeStaff.length === 1) {
          staffName = activeStaff[0].staffName || '';
        } else if (activeStaff.length > 1) {
          // Check auto-assign rules for the booking day
          const bookingDate = new Date(dateTime);
          const dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][bookingDate.getDay()];
          for (const staff of activeStaff) {
            if (!staff.autoAssignRules) continue;
            const rules = JSON.parse(staff.autoAssignRules as string);
            if (rules.some((r: any) => r.action === 'auto-assign' && r.days?.includes(dayOfWeek))) {
              staffName = staff.staffName || '';
              break;
            }
          }
        }
      }
    } catch (e) { /* use defaults */ }

    const formattedDateTime = new Date(dateTime).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    // --- Send notifications (must await before returning on Amplify/Lambda) ---
    const notifications: Promise<void>[] = [];
    
    // Build "With" line: staff first name performing the service
    const withName = staffName ? staffName.split(' ')[0] : '';

    if (customer.phone && customer.smsOptIn) {
      const withLine = withName ? `\nWith: ${withName}` : '';
      const customerMsg = `Your appointment with ${vendorName} has been booked!\n\nService: ${serviceName}${withLine}\nDate/Time: ${formattedDateTime}\n\nThe Spa Synergy\nReply STOP to opt out`;
      notifications.push(sendSms(customer.phone, customerMsg).catch(err => console.error('Customer SMS failed:', err)) as Promise<void>);
    }
    if (customer.email) {
      notifications.push(sendCustomerBookingEmail({
        to: customer.email, serviceName, vendorName, dateTime, duration: serviceDuration, price: servicePrice, withName,
      }).catch(err => console.error('Customer email failed:', err)));
    }

    notifications.push(fetch(`${request.headers.get('origin')}/api/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, vendorId })
    }).then(() => {}).catch(err => console.error('Vendor SMS failed:', err)));

    if (vendorEmail || process.env.EMAIL_TEST_ADDRESS) {
      notifications.push(sendVendorBookingEmail({
        to: vendorEmail || 'vendor@placeholder.com', customerName: customer.name, customerPhone: customer.phone || '',
        customerEmail: customer.email || '', serviceName, dateTime,
      }).catch(err => console.error('Vendor email failed:', err)));
    } else {
      console.log('Vendor email skipped: no vendorEmail set and no EMAIL_TEST_ADDRESS');
    }

    // Staff member notifications
    try {
      let assignedStaffRecord = null;
      if (staffId) {
        const { data: staffRec } = await client.models.StaffSchedule.get({ visibleId: staffId });
        assignedStaffRecord = staffRec;
      }
      if (!assignedStaffRecord) {
        const { data: staffList } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId });
        const activeStaff = (staffList || []).filter(s => s.isActive);
        if (activeStaff.length === 1) {
          assignedStaffRecord = activeStaff[0];
        } else if (activeStaff.length > 1) {
          const bookingDate = new Date(dateTime);
          const dayOfWeek = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][bookingDate.getDay()];
          for (const staff of activeStaff) {
            if (!staff.autoAssignRules) continue;
            const rules = JSON.parse(staff.autoAssignRules as string);
            if (rules.some((r: any) => r.action === 'auto-assign' && r.days?.includes(dayOfWeek))) {
              assignedStaffRecord = staff;
              break;
            }
          }
        }
      }
      if (assignedStaffRecord) {
        if (assignedStaffRecord.smsAlertsEnabled && assignedStaffRecord.smsAlertPhone) {
          const staffMsg = `New Booking Alert!\n\nService: ${serviceName}\nCustomer: ${customer.name}\nPhone: ${customer.phone}\nDate/Time: ${formattedDateTime}\n\nThe Spa Synergy\nReply STOP to opt out`;
          notifications.push(sendSms(assignedStaffRecord.smsAlertPhone, staffMsg).catch(err => console.error('Staff SMS failed:', err)) as Promise<void>);
        }
        if (assignedStaffRecord.emailAlertsEnabled && assignedStaffRecord.staffEmail) {
          notifications.push(sendVendorBookingEmail({
            to: assignedStaffRecord.staffEmail, customerName: customer.name, customerPhone: customer.phone || '',
            customerEmail: customer.email || '', serviceName, dateTime,
          }).catch(err => console.error('Staff email failed:', err)));
        }
      }
    } catch (e) { console.error('Staff notification lookup failed:', e); }

    await Promise.all(notifications);

    return Response.json({ 
      success: true, 
      appointmentId 
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
