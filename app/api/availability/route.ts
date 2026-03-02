import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import { cookies } from 'next/headers';
import type { Schema } from '../../../amplify/data/resource';
import config from '../../../amplify_outputs.json' with { type: 'json' };

const client = generateServerClientUsingCookies<Schema>({
  config,
  cookies,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const serviceId = searchParams.get('serviceId');
  const date = searchParams.get('date'); // YYYY-MM-DD format

  if (!vendorId || !serviceId || !date) {
    return Response.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  try {
    // Get vendor details
    const { data: vendor, errors: vendorErrors } = await client.models.Vendor.get({ vendorId });

    if (vendorErrors || !vendor) {
      return Response.json({ error: 'Vendor not found' }, { status: 404 });
    }

    // Get service details
    const { data: service, errors: serviceErrors } = await client.models.Service.get({ serviceId });

    if (serviceErrors || !service) {
      return Response.json({ error: 'Service not found' }, { status: 404 });
    }

    // Parse working hours
    const workingHours = JSON.parse(vendor.workingHours as string);
    const requestedDate = new Date(date);
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][requestedDate.getDay()];
    
    const dayHours = workingHours[dayOfWeek];
    if (!dayHours || !dayHours.start || !dayHours.end) {
      return Response.json({ availableSlots: [] }); // Closed on this day
    }

    // Get existing appointments for this vendor on this date
    // For the same resource type (staff vs sauna)
    const serviceResourceType = service.resourceType || 'staff';
    
    // Get all appointments for this vendor on this date
    const { data: allAppointments } = await client.models.Appointment.list({
      filter: { 
        vendorId: { eq: vendorId },
        dateTime: { beginsWith: date }
      }
    });

    // Filter appointments by resource type
    const appointments = [];
    for (const apt of allAppointments || []) {
      const { data: aptService } = await client.models.Service.get({ serviceId: apt.serviceId });
      const aptResourceType = aptService?.resourceType || 'staff';
      if (aptResourceType === serviceResourceType) {
        appointments.push(apt);
      }
    }

    const bookedSlots = appointments;

    // Generate available time slots
    const slots = generateTimeSlots(
      dayHours.start,
      dayHours.end,
      service.duration,
      vendor.bufferMinutes || 15,
      bookedSlots,
      date
    );

    return Response.json({ availableSlots: slots });
  } catch (error) {
    console.error('Error fetching availability:', error);
    return Response.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}

function generateTimeSlots(startTime: string, endTime: string, serviceDuration: number, bufferMinutes: number, bookedSlots: any[], date: string) {
  const slots = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  while (currentMinutes + serviceDuration <= endMinutes) {
    const hour = Math.floor(currentMinutes / 60);
    const min = currentMinutes % 60;
    const timeString = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    const displayTime = formatTime(hour, min);

    // Check if this slot conflicts with existing appointments
    const isBooked = bookedSlots.some(appointment => {
      // Parse ISO datetime (YYYY-MM-DDTHH:MM:SS)
      const appointmentDateTime = appointment.dateTime
      const appointmentTime = appointmentDateTime.includes('T') 
        ? appointmentDateTime.split('T')[1].substring(0, 5) // Extract HH:MM from ISO
        : appointmentDateTime.split(' ')[1] // Fallback for old format
      
      // Get service duration for this appointment
      return timeOverlaps(timeString, appointmentTime, serviceDuration, bufferMinutes);
    });

    if (!isBooked) {
      slots.push({
        time: timeString,
        display: displayTime
      });
    }

    currentMinutes += 30; // 30-minute intervals
  }

  return slots;
}

function timeOverlaps(newTime: string, bookedTime: string, newServiceDuration: number, bufferMinutes: number) {
  const [newHour, newMin] = newTime.split(':').map(Number);
  const newStart = newHour * 60 + newMin;
  const newEnd = newStart + newServiceDuration + bufferMinutes;

  const [bookedHour, bookedMin] = bookedTime.split(':').map(Number);
  const bookedStart = bookedHour * 60 + bookedMin;
  // Assume booked appointment has similar duration + buffer
  const bookedEnd = bookedStart + newServiceDuration + bufferMinutes;

  return (newStart < bookedEnd && newEnd > bookedStart);
}

function parseTimeToMinutes(timeStr: string) {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return 0;

  let hour = parseInt(match[1]);
  const min = parseInt(match[2]);
  const period = match[3];

  if (period) {
    if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
  }

  return hour * 60 + min;
}

function formatTime(hour: number, min: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${min.toString().padStart(2, '0')} ${period}`;
}
