import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../../amplify/data/resource';
import config from '../../../../amplify_outputs.json' with { type: 'json' };

const client = generateServerClientUsingCookies<Schema>({ config, cookies });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appointmentId = searchParams.get('appointmentId');
  const bundleId = searchParams.get('bundleId');

  try {
    // Use local date string (Eastern Time) to match appointment dateTime format
    // Appointments are stored with local time like "2026-06-30T12:30"
    const now = new Date();
    const eastern = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    // eastern = "YYYY-MM-DD"
    const todayStart = `${eastern}T00:00`;
    const todayEnd = `${eastern}T23:59`;

    // Get all active vendors
    const { data: vendors } = await client.models.Vendor.list();
    const activeVendors = (vendors || []).filter(v => v.isActive !== false);
    const vendorMap = new Map(activeVendors.map(v => [v.vendorId, v.name]));

    // Fetch today's appointments across all vendors
    const allAppointments = await Promise.all(
      activeVendors.map(v =>
        client.models.Appointment.listAppointmentByVendorIdAndDateTime({
          vendorId: v.vendorId,
          dateTime: { between: [todayStart, todayEnd] }
        }).then(res => res.data || [])
      )
    );

    let unpaid = allAppointments.flat().filter(apt =>
      apt.status !== 'cancelled' && !apt.paymentId && apt.paymentStatus !== 'paid'
    );

    // If requesting a single appointment, filter to just that one.
    // If it's part of a group, include all group members so the UI has full context.
    if (appointmentId) {
      const target = unpaid.find(apt => apt.appointmentId === appointmentId);
      if (target && (target as any).groupId) {
        // Fetch all group members (including already-paid ones for display)
        const groupId = (target as any).groupId;
        unpaid = allAppointments.flat().filter(apt =>
          apt.status !== 'cancelled' && (apt as any).groupId === groupId
        );
      } else {
        unpaid = unpaid.filter(apt => apt.appointmentId === appointmentId);
      }
    }

    // If requesting by bundleId, filter to all appointments in that bundle (paid or not)
    if (bundleId) {
      unpaid = allAppointments.flat().filter(apt =>
        apt.status !== 'cancelled' && (apt as any).bundleId === bundleId
      );
    }

    const enriched = await Promise.all(
      unpaid.map(async (apt) => {
        const { data: service } = await client.models.Service.get({ serviceId: apt.serviceId });

        let customer = apt.customer;
        if (typeof customer === 'string') {
          try { customer = JSON.parse(customer); } catch {}
        }

        let staffName = null;
        if (apt.staffId) {
          try {
            const { data: staff } = await client.models.StaffSchedule.get({ visibleId: apt.staffId });
            staffName = staff?.staffName || null;
          } catch {}
        }

        return {
          appointmentId: apt.appointmentId,
          vendorId: apt.vendorId,
          vendorName: vendorMap.get(apt.vendorId) || 'Unknown',
          serviceId: apt.serviceId,
          staffId: apt.staffId,
          bundleId: (apt as any).bundleId || null,
          groupId: (apt as any).groupId || null,
          dateTime: apt.dateTime,
          status: apt.status,
          customer: { name: (customer as any)?.name || 'Walk-in' },
          service: service ? { name: service.name, duration: service.duration, price: service.price, vendorId: service.vendorId, houseFeeEnabled: (service as any).houseFeeEnabled, houseFeeAmount: (service as any).houseFeeAmount } : null,
          staffName,
        };
      })
    );

    enriched.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    // Collapse groupId-linked appointments into a single payable entry.
    // Multi-provider services (e.g., couples head bath) create multiple calendar
    // appointments sharing a groupId but only ONE payment should be collected.
    const groupMap = new Map<string, typeof enriched>();
    const ungrouped: typeof enriched = [];

    enriched.forEach(apt => {
      const gid = (apt as any).groupId;
      if (gid) {
        if (!groupMap.has(gid)) groupMap.set(gid, []);
        groupMap.get(gid)!.push(apt);
      } else {
        ungrouped.push(apt);
      }
    });

    const finalAppointments: any[] = [...ungrouped];

    groupMap.forEach((groupApts, groupId) => {
      // Expose the first appointment as the "payable" representative,
      // enriched with group metadata so the UI knows it's a multi-provider service.
      const primary = groupApts[0];
      finalAppointments.push({
        ...primary,
        groupId,
        isGroupPayment: true,
        groupSize: groupApts.length,
        groupStaff: groupApts.map(a => ({ staffId: a.staffId, staffName: a.staffName, vendorId: a.vendorId, vendorName: a.vendorName })),
        groupAppointmentIds: groupApts.map(a => a.appointmentId),
      });
    });

    finalAppointments.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    return Response.json({ appointments: finalAppointments });
  } catch (error) {
    console.error('Kiosk appointments error:', error);
    return Response.json({ error: 'Failed to fetch appointments' }, { status: 500 });
  }
}
