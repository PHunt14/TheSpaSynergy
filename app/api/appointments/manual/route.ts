import { client, getCurrentUser } from '@/lib/auth';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { vendorId, serviceId, staffId, dateTime, customerName, customerPhone, customerEmail, notes } = body;

    if (!vendorId || !dateTime) {
      return Response.json({ error: 'vendorId and dateTime are required' }, { status: 400 });
    }

    if (user.role === 'vendor' && vendorId !== user.vendorId) {
      return Response.json({ error: 'Can only add appointments to your own calendar' }, { status: 403 });
    }

    const appointmentId = randomUUID();

    const { errors } = await client.models.Appointment.create({
      appointmentId,
      vendorId,
      serviceId: serviceId || 'manual',
      staffId: staffId || undefined,
      dateTime,
      customer: JSON.stringify({
        name: customerName || 'Manual Entry',
        phone: customerPhone || '',
        email: customerEmail || '',
        notes: notes || '',
        isManual: true,
      }),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    } as any);

    if (errors) {
      console.error('Error creating manual appointment:', errors);
      return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
    }

    return Response.json({ success: true, appointmentId });
  } catch (error) {
    console.error('Error creating manual appointment:', error);
    return Response.json({ error: 'Failed to create appointment' }, { status: 500 });
  }
}
