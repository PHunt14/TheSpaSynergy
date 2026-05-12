import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };
import { randomUUID } from 'crypto';
import { sendBookingNotifications } from '@/lib/appointment-notifications';
import { assignStaff } from '@/app/utils/staffAssigner.js';

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function PATCH(request: Request) {
  try {
    const { appointmentId, paymentId, paymentStatus, paymentAmount, status, serviceId, staffId, vendorId, customer } = await request.json();

    if (!appointmentId) {
      return Response.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const updateFields: any = { appointmentId };
    if (paymentId !== undefined) updateFields.paymentId = paymentId;
    if (paymentStatus !== undefined) updateFields.paymentStatus = paymentStatus;
    if (paymentAmount !== undefined) updateFields.paymentAmount = paymentAmount;
    if (status !== undefined) updateFields.status = status;
    if (serviceId !== undefined) updateFields.serviceId = serviceId;
    if (staffId !== undefined) updateFields.staffId = staffId;
    if (vendorId !== undefined) updateFields.vendorId = vendorId;
    if (customer !== undefined) updateFields.customer = customer;

    const { errors } = await client.models.Appointment.update(updateFields);

    if (errors) {
      console.error('Error updating appointment:', errors);
      return Response.json({ error: 'Failed to update appointment' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error updating appointment:', error);
    return Response.json({ error: 'Failed to update appointment' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vendorId, serviceId, bundleId, dateTime, customer, status, paymentId, paymentStatus, paymentAmount, staffId } = body;

    if (!vendorId || !serviceId || !dateTime || !customer) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check global booking blackout
    const { data: globalSetting } = await client.models.SiteSettings.get({ settingKey: 'globalBookingDisabledUntil' });
    if (globalSetting?.settingValue && new Date(globalSetting.settingValue) > new Date()) {
      return Response.json({ error: 'Online booking is temporarily disabled' }, { status: 403 });
    }

    // Check vendor-level booking blackout
    const { data: vendorCheck } = await client.models.Vendor.get({ vendorId });
    const vendorUntil = vendorCheck?.bookingDisabledUntil as string | null;
    if (vendorUntil && new Date(vendorUntil) > new Date()) {
      return Response.json({ error: 'Booking is temporarily disabled for this vendor' }, { status: 403 });
    }

    // Multi-provider booking path
    if (body.multiProvider === true) {
      return await handleMultiProviderBooking(body, client);
    }

    // Multi-quantity booking path
    if (body.quantity && body.quantity > 1) {
      return await handleQuantityBooking(body, client);
    }

    // Check if service requires multiple providers (auto-detect)
    const { data: serviceCheck } = await client.models.Service.get({ serviceId });
    if (serviceCheck && (serviceCheck.providersRequired as number) > 1) {
      return await handleMultiProviderBooking({ ...body, multiProvider: true }, client);
    }

    const appointmentId = randomUUID();

    // Auto-assign staff if none provided
    let assignedStaffId = staffId;
    if (!assignedStaffId) {
      const { data: svcData } = await client.models.Service.get({ serviceId });
      const allowedStaff = (svcData?.allowedStaff as string[]) || [];
      if (allowedStaff.length > 0) {
        assignedStaffId = allowedStaff[0];
      } else {
        // allowedStaff is null/empty = all staff for this vendor can do it
        const { data: vendorStaff } = await client.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId } as any);
        const activeStaff = (vendorStaff || []).filter((s: any) => s.isActive !== false);
        if (activeStaff.length > 0) assignedStaffId = activeStaff[0].visibleId;
      }
    }

    const { data, errors } = await client.models.Appointment.create({
      appointmentId,
      vendorId,
      serviceId,
      staffId: assignedStaffId || undefined,
      bundleId: bundleId || undefined,
      dateTime,
      customer: JSON.stringify(customer),
      status: status || 'pending-confirmation',
      paymentId,
      paymentStatus: paymentStatus || undefined,
      paymentAmount: paymentAmount || undefined,
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      console.error('Error creating appointment:', errors);
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    // Auto-populate client catalog
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const clientRes = await fetch(`${appUrl}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customer.name, phone: customer.phone, email: customer.email })
      });
      const clientData = await clientRes.json();
      if (clientData.client?.clientId) {
        await client.models.Appointment.update({ appointmentId, clientId: clientData.client.clientId } as any);
      }
    } catch (e) { console.error('Client auto-populate failed:', e); }

    await sendBookingNotifications({ appointmentId, vendorId, serviceId, staffId: assignedStaffId, dateTime, customer });

    return Response.json({ success: true, appointmentId });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}

async function handleMultiProviderBooking(body: any, amplifyClient: any) {
  const { serviceId, dateTime, customer, status } = body;

  // Fetch the service to get allowedStaff, providersRequired, duration
  const { data: service, errors: serviceErrors } = await amplifyClient.models.Service.get({ serviceId });
  if (serviceErrors || !service) {
    return Response.json({ error: 'Service not found' }, { status: 404 });
  }

  let allowedStaff = (service.allowedStaff as string[]) || [];

  // If allowedStaff is empty (null = all staff), fetch all active staff across all vendors
  if (allowedStaff.length === 0) {
    const { data: allStaff } = await amplifyClient.models.StaffSchedule.list();
    allowedStaff = (allStaff || []).filter((s: any) => s.isActive !== false).map((s: any) => s.visibleId);
  }

  if (allowedStaff.length === 0) {
    return Response.json({ error: 'No staff available for this service' }, { status: 400 });
  }

  // Extract date and time from dateTime (e.g., "2024-01-15T09:00")
  const [date, time] = dateTime.includes('T')
    ? [dateTime.split('T')[0], dateTime.split('T')[1].substring(0, 5)]
    : [dateTime.split(' ')[0], dateTime.split(' ')[1]];

  // Fetch staff schedules for all staff in allowedStaff
  const staffSchedulePromises = allowedStaff.map((staffId: string) =>
    amplifyClient.models.StaffSchedule.get({ visibleId: staffId })
  );
  const staffScheduleResults = await Promise.all(staffSchedulePromises);

  const staffSchedules = staffScheduleResults
    .filter((result: any) => !result.errors && result.data)
    .map((result: any) => result.data);

  if (staffSchedules.length === 0) {
    return Response.json({ error: 'No staff schedules found' }, { status: 400 });
  }

  // Fetch existing appointments for the date across all relevant vendors
  const vendorIds = [...new Set(staffSchedules.map((s: any) => s.vendorId).filter(Boolean))] as string[];

  const appointmentPromises = vendorIds.map((vid: string) =>
    amplifyClient.models.Appointment.list({
      filter: {
        vendorId: { eq: vid },
        dateTime: { beginsWith: date }
      }
    })
  );
  const appointmentResults = await Promise.all(appointmentPromises);

  const existingAppointments = appointmentResults
    .flatMap((result: any) => result.data || [])
    .filter((apt: any) => apt.status !== 'cancelled');

  // Determine buffer minutes from the first vendor (lead vendor)
  const leadVendorId = service.leadVendorId || vendorIds[0];
  const { data: leadVendor } = await amplifyClient.models.Vendor.get({ vendorId: leadVendorId });
  const bufferMinutes = leadVendor?.bufferMinutes || 15;

  // Run staff assignment
  let assignedStaffMembers;
  try {
    assignedStaffMembers = assignStaff({
      service,
      staffSchedules,
      appointments: existingAppointments,
      date,
      time,
      bufferMinutes
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Selected time is no longer available' }, { status: 409 });
  }

  // Generate a shared groupId
  const groupId = randomUUID();

  // Create one appointment per assigned staff member
  const appointmentIds: string[] = [];
  const creationErrors: any[] = [];

  for (const staff of assignedStaffMembers) {
    const appointmentId = randomUUID();

    const { errors } = await amplifyClient.models.Appointment.create({
      appointmentId,
      vendorId: staff.vendorId,
      serviceId,
      staffId: staff.staffId,
      groupId,
      dateTime,
      customer: JSON.stringify(customer),
      status: status || 'pending-confirmation',
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      creationErrors.push({ appointmentId, errors });
    } else {
      appointmentIds.push(appointmentId);
    }
  }

  // If any creation failed, roll back the successfully created ones
  if (creationErrors.length > 0) {
    for (const id of appointmentIds) {
      try {
        await amplifyClient.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any);
      } catch (e) {
        console.error('Rollback failed for appointment:', id, e);
      }
    }
    console.error('Error creating multi-provider appointments:', creationErrors);
    return Response.json({ error: 'Failed to create appointments' }, { status: 500 });
  }

  // Auto-populate client catalog
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const clientRes = await fetch(`${appUrl}/api/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: customer.name, phone: customer.phone, email: customer.email })
    });
    const clientData = await clientRes.json();
    if (clientData.client?.clientId) {
      for (const id of appointmentIds) {
        await amplifyClient.models.Appointment.update({ appointmentId: id, clientId: clientData.client.clientId } as any);
      }
    }
  } catch (e) { console.error('Client auto-populate failed:', e); }

  // Send booking notifications for each appointment
  for (const staff of assignedStaffMembers) {
    const aptId = appointmentIds[assignedStaffMembers.indexOf(staff)];
    try {
      await sendBookingNotifications({ appointmentId: aptId, vendorId: staff.vendorId, serviceId, staffId: staff.staffId, dateTime, customer });
    } catch (e) { console.error('Notification failed for appointment:', aptId, e); }
  }

  return Response.json({ success: true, appointmentIds, groupId });
}

async function handleQuantityBooking(body: any, amplifyClient: any) {
  const { vendorId, serviceId, dateTime, customer, status, quantity, quantityMode, staffId, paymentId, paymentStatus, paymentAmount } = body;

  // Fetch the service
  const { data: service, errors: serviceErrors } = await amplifyClient.models.Service.get({ serviceId });
  if (serviceErrors || !service) {
    return Response.json({ error: 'Service not found' }, { status: 404 });
  }

  // Validate quantity against maxQuantityPerBooking
  const maxQty = service.maxQuantityPerBooking || 1;
  if (quantity > maxQty) {
    return Response.json({ error: `Maximum quantity for this service is ${maxQty}` }, { status: 400 });
  }

  const duration = service.duration;
  const mode = quantityMode || 'sequential';

  // Generate a shared groupId for all appointments in this quantity booking
  const groupId = randomUUID();
  const appointmentIds: string[] = [];
  const creationErrors: any[] = [];

  if (mode === 'parallel') {
    // Parallel: assign different staff to each unit, all at the same dateTime
    const allowedStaff = (service.allowedStaff as string[]) || [];
    if (allowedStaff.length < quantity) {
      return Response.json({ error: 'Not enough staff available for parallel booking' }, { status: 400 });
    }

    // Fetch staff schedules and existing appointments for assignment
    const [date, time] = dateTime.includes('T')
      ? [dateTime.split('T')[0], dateTime.split('T')[1].substring(0, 5)]
      : [dateTime.split(' ')[0], dateTime.split(' ')[1]];

    const staffSchedulePromises = allowedStaff.map((sid: string) =>
      amplifyClient.models.StaffSchedule.get({ visibleId: sid })
    );
    const staffScheduleResults = await Promise.all(staffSchedulePromises);
    const staffSchedules = staffScheduleResults
      .filter((r: any) => !r.errors && r.data)
      .map((r: any) => r.data);

    const vendorIds = [...new Set(staffSchedules.map((s: any) => s.vendorId).filter(Boolean))] as string[];
    const appointmentPromises = vendorIds.map((vid: string) =>
      amplifyClient.models.Appointment.list({ filter: { vendorId: { eq: vid }, dateTime: { beginsWith: date } } })
    );
    const appointmentResults = await Promise.all(appointmentPromises);
    const existingAppointments = appointmentResults
      .flatMap((r: any) => r.data || [])
      .filter((apt: any) => apt.status !== 'cancelled');

    const { data: leadVendor } = await amplifyClient.models.Vendor.get({ vendorId });
    const bufferMinutes = leadVendor?.bufferMinutes || 15;

    // Use assignStaff with providersRequired = quantity
    let assignedStaffMembers;
    try {
      assignedStaffMembers = assignStaff({
        service: { ...service, providersRequired: quantity },
        staffSchedules,
        appointments: existingAppointments,
        date,
        time,
        bufferMinutes
      });
    } catch (error: any) {
      return Response.json({ error: error.message || 'Selected time is no longer available' }, { status: 409 });
    }

    // Create one appointment per staff member
    for (const staff of assignedStaffMembers) {
      const appointmentId = randomUUID();
      const { errors } = await amplifyClient.models.Appointment.create({
        appointmentId,
        vendorId: staff.vendorId,
        serviceId,
        staffId: staff.staffId,
        groupId,
        dateTime,
        customer: JSON.stringify(customer),
        status: status || 'pending-confirmation',
        paymentId,
        paymentStatus: paymentStatus || undefined,
        paymentAmount: paymentAmount || undefined,
        createdAt: new Date().toISOString(),
      } as any);

      if (errors) {
        creationErrors.push({ appointmentId, errors });
      } else {
        appointmentIds.push(appointmentId);
      }
    }
  } else {
    // Sequential: same staff, back-to-back appointments
    const bufferMinutes = 15;
    const { data: vendorData } = await amplifyClient.models.Vendor.get({ vendorId });
    const actualBuffer = vendorData?.bufferMinutes || bufferMinutes;

    // Auto-assign staff if none provided
    let assignedStaffId = staffId;
    if (!assignedStaffId) {
      const allowedStaff = (service.allowedStaff as string[]) || [];
      if (allowedStaff.length > 0) {
        assignedStaffId = allowedStaff[0];
      } else {
        // allowedStaff is null = all staff for this vendor
        const { data: vendorStaff } = await amplifyClient.models.StaffSchedule.listStaffScheduleByVendorId({ vendorId } as any);
        const activeStaff = (vendorStaff || []).filter((s: any) => s.isActive !== false);
        if (activeStaff.length > 0) assignedStaffId = activeStaff[0].visibleId;
      }
    }

    // Parse the start dateTime
    const [date, timeStr] = dateTime.includes('T')
      ? [dateTime.split('T')[0], dateTime.split('T')[1].substring(0, 5)]
      : [dateTime.split(' ')[0], dateTime.split(' ')[1]];

    const [startHour, startMin] = timeStr.split(':').map(Number);
    let currentMinutes = startHour * 60 + startMin;

    for (let i = 0; i < quantity; i++) {
      const hour = Math.floor(currentMinutes / 60);
      const min = currentMinutes % 60;
      const slotDateTime = `${date}T${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:00`;

      const appointmentId = randomUUID();
      const { errors } = await amplifyClient.models.Appointment.create({
        appointmentId,
        vendorId,
        serviceId,
        staffId: assignedStaffId || undefined,
        groupId,
        dateTime: slotDateTime,
        customer: JSON.stringify(customer),
        status: status || 'pending-confirmation',
        paymentId,
        paymentStatus: paymentStatus || undefined,
        paymentAmount: paymentAmount || undefined,
        createdAt: new Date().toISOString(),
      } as any);

      if (errors) {
        creationErrors.push({ appointmentId, errors });
      } else {
        appointmentIds.push(appointmentId);
      }

      // Move to next slot: duration + buffer
      currentMinutes += duration + actualBuffer;
    }
  }

  // Rollback on failure
  if (creationErrors.length > 0) {
    for (const id of appointmentIds) {
      try {
        await amplifyClient.models.Appointment.update({ appointmentId: id, status: 'cancelled' } as any);
      } catch (e) {
        console.error('Rollback failed for appointment:', id, e);
      }
    }
    console.error('Error creating quantity appointments:', creationErrors);
    return Response.json({ error: 'Failed to create appointments' }, { status: 500 });
  }

  // Auto-populate client catalog
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const clientRes = await fetch(`${appUrl}/api/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: customer.name, phone: customer.phone, email: customer.email })
    });
    const clientData = await clientRes.json();
    if (clientData.client?.clientId) {
      for (const id of appointmentIds) {
        await amplifyClient.models.Appointment.update({ appointmentId: id, clientId: clientData.client.clientId } as any);
      }
    }
  } catch (e) { console.error('Client auto-populate failed:', e); }

  // Send notifications
  await sendBookingNotifications({ appointmentId: appointmentIds[0], vendorId, serviceId, staffId: assignedStaffId, dateTime, customer });

  return Response.json({ success: true, appointmentIds, groupId, quantity, mode: quantityMode });
}
