import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getAwsConfig } from '../../config/aws';
import { TABLE_NAMES } from '../../config/tables';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get('vendorId');
  const serviceId = searchParams.get('serviceId');
  const date = searchParams.get('date'); // YYYY-MM-DD format

  if (!vendorId || !serviceId || !date) {
    return Response.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  try {
    const awsConfig = await getAwsConfig();
    const client = new DynamoDBClient(awsConfig);
    const docClient = DynamoDBDocumentClient.from(client);
    
    // Get vendor details (working hours, buffer time)
    const vendorResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAMES.VENDORS,
      Key: { vendorId }
    }));

    const vendor = vendorResult.Item;
    if (!vendor) {
      return Response.json({ error: 'Vendor not found' }, { status: 404 });
    }

    // Get service details (duration)
    const serviceResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAMES.SERVICES,
      Key: { serviceId }
    }));

    const service = serviceResult.Item;
    if (!service) {
      return Response.json({ error: 'Service not found' }, { status: 404 });
    }

    // Get day of week
    const requestedDate = new Date(date);
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][requestedDate.getDay()];
    
    const workingHours = vendor.workingHours[dayOfWeek];
    if (!workingHours || !workingHours.start || !workingHours.end) {
      return Response.json({ availableSlots: [] }); // Closed on this day
    }

    // Get existing appointments for this vendor on this date
    const appointmentsResult = await docClient.send(new QueryCommand({
      TableName: TABLE_NAMES.APPOINTMENTS,
      IndexName: 'VendorDateIndex',
      KeyConditionExpression: 'vendorId = :vendorId AND begins_with(#dt, :date)',
      ExpressionAttributeNames: {
        '#dt': 'dateTime'
      },
      ExpressionAttributeValues: {
        ':vendorId': vendorId,
        ':date': date
      }
    }));

    const bookedSlots = appointmentsResult.Items || [];

    // Generate available time slots
    const slots = generateTimeSlots(
      workingHours.start,
      workingHours.end,
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

function generateTimeSlots(startTime, endTime, serviceDuration, bufferMinutes, bookedSlots, date) {
  const slots = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  const totalDuration = serviceDuration + bufferMinutes;

  while (currentMinutes + serviceDuration <= endMinutes) {
    const hour = Math.floor(currentMinutes / 60);
    const min = currentMinutes % 60;
    const timeString = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    const displayTime = formatTime(hour, min);

    // Check if this slot conflicts with existing appointments
    const isBooked = bookedSlots.some(appointment => {
      const appointmentTime = appointment.dateTime.split(' ')[1]; // Extract time from "MM/DD/YYYY HH:MM AM/PM"
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

function timeOverlaps(newTime, bookedTime, serviceDuration, bufferMinutes) {
  // Convert times to minutes for comparison
  const [newHour, newMin] = newTime.split(':').map(Number);
  const newStart = newHour * 60 + newMin;
  const newEnd = newStart + serviceDuration + bufferMinutes;

  // Parse booked time (could be "2:00 PM" format)
  const bookedStart = parseTimeToMinutes(bookedTime);
  const bookedEnd = bookedStart + serviceDuration + bufferMinutes;

  return (newStart < bookedEnd && newEnd > bookedStart);
}

function parseTimeToMinutes(timeStr) {
  // Handle "HH:MM AM/PM" format
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

function formatTime(hour, min) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${min.toString().padStart(2, '0')} ${period}`;
}
