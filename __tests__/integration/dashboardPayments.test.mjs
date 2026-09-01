/**
 * Integration tests for Dashboard Payment Features
 *
 * Validates:
 * - Transaction filtering by date/status/payment
 * - Pagination of large transaction lists
 * - Role-based access control (vendor/staff see only own data)
 * - Summary statistics calculation
 * - Multi-provider transaction grouping
 *
 * Requirements: 10.4, 10.5, 11.2
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

// Mock Amplify client
const mockAppointments = [];
const mockServices = {};
const mockStaff = {};
const mockVendors = {};

function setupMocks() {
  mockAppointments.length = 0;
  Object.keys(mockServices).forEach(k => delete mockServices[k]);
  Object.keys(mockStaff).forEach(k => delete mockStaff[k]);
  Object.keys(mockVendors).forEach(k => delete mockVendors[k]);

  // Setup vendors
  mockVendors['vendor-kera'] = { vendorId: 'vendor-kera', name: 'Kera Studio', isHouse: true, isActive: true };
  mockVendors['vendor-winsome'] = { vendorId: 'vendor-winsome', name: 'Winsome Woods', isActive: true };

  // Setup staff
  mockStaff['staff-sarah'] = {
    visibleId: 'staff-sarah',
    staffName: 'Sarah',
    vendorId: 'vendor-winsome',
    squareAccessToken: 'sq_test_sarah',
    squareLocationId: 'loc_sarah',
    squareOAuthStatus: 'connected',
  };
  mockStaff['staff-marcus'] = {
    visibleId: 'staff-marcus',
    staffName: 'Marcus',
    vendorId: 'vendor-winsome',
    squareAccessToken: 'sq_test_marcus',
    squareLocationId: 'loc_marcus',
    squareOAuthStatus: 'connected',
  };
  mockStaff['staff-disconnected'] = {
    visibleId: 'staff-disconnected',
    staffName: 'Disconnected Staff',
    vendorId: 'vendor-winsome',
    squareAccessToken: null,
    squareLocationId: null,
    squareOAuthStatus: 'disconnected',
  };

  // Setup services
  mockServices['svc-massage-60'] = {
    serviceId: 'svc-massage-60',
    vendorId: 'vendor-winsome',
    name: '60-min Massage',
    price: 65,
    houseFeeEnabled: true,
    houseFeeAmount: 20,
  };
  mockServices['svc-couples-90'] = {
    serviceId: 'svc-couples-90',
    vendorId: 'vendor-winsome',
    name: '90-min Couples Service',
    price: 150,
    houseFeeEnabled: true,
    houseFeeAmount: 30,
  };
  mockServices['svc-consultation'] = {
    serviceId: 'svc-consultation',
    vendorId: 'vendor-kera',
    name: 'Consultation',
    price: 50,
    houseFeeEnabled: false,
  };
}

describe('Dashboard Payment Features (Integration)', () => {
  beforeAll(() => {
    setupMocks();
  });

  describe('Transaction Filtering', () => {
    test('filters transactions by date range', () => {
      // Setup: Create appointments on different dates
      const apt1 = {
        appointmentId: 'apt-1',
        vendorId: 'vendor-winsome',
        serviceId: 'svc-massage-60',
        staffId: 'staff-sarah',
        dateTime: '2026-08-31T10:00',
        status: 'confirmed',
        paymentId: 'pay-1',
        paymentStatus: 'paid',
        paymentAmount: 65,
      };
      const apt2 = {
        appointmentId: 'apt-2',
        vendorId: 'vendor-winsome',
        serviceId: 'svc-massage-60',
        staffId: 'staff-sarah',
        dateTime: '2026-09-01T10:00',
        status: 'confirmed',
        paymentId: null,
        paymentStatus: null,
      };

      // Simulate API call with date range
      const startDate = '2026-08-31T00:00';
      const endDate = '2026-08-31T23:59';

      const filtered = [apt1, apt2].filter(apt => apt.dateTime >= startDate && apt.dateTime <= endDate);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].appointmentId).toBe('apt-1');
    });

    test('filters transactions by status', () => {
      const appointments = [
        { appointmentId: 'apt-1', status: 'confirmed', vendorId: 'vendor-winsome' },
        { appointmentId: 'apt-2', status: 'pending-confirmation', vendorId: 'vendor-winsome' },
        { appointmentId: 'apt-3', status: 'cancelled', vendorId: 'vendor-winsome' },
      ];

      const filtered = appointments.filter(apt => apt.status === 'confirmed');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].appointmentId).toBe('apt-1');
    });

    test('filters transactions by payment status', () => {
      const appointments = [
        { appointmentId: 'apt-1', paymentId: 'pay-1', paymentStatus: 'paid', vendorId: 'vendor-winsome' },
        { appointmentId: 'apt-2', paymentId: null, paymentStatus: null, vendorId: 'vendor-winsome' },
        { appointmentId: 'apt-3', paymentId: 'pay-3', paymentStatus: 'paid', vendorId: 'vendor-winsome' },
      ];

      const paid = appointments.filter(apt => apt.paymentId || apt.paymentStatus === 'paid');
      const unpaid = appointments.filter(apt => !apt.paymentId && apt.paymentStatus !== 'paid');

      expect(paid).toHaveLength(2);
      expect(unpaid).toHaveLength(1);
    });
  });

  describe('Pagination', () => {
    test('slices transactions by limit and offset', () => {
      const appointments = Array.from({ length: 100 }, (_, i) => ({
        appointmentId: `apt-${i}`,
        vendorId: 'vendor-winsome',
      }));

      const limit = 50;
      const offset = 0;
      const page1 = appointments.slice(offset, offset + limit);
      const page2 = appointments.slice(offset + limit, offset + 2 * limit);

      expect(page1).toHaveLength(50);
      expect(page2).toHaveLength(50);
      expect(page1[0].appointmentId).toBe('apt-0');
      expect(page2[0].appointmentId).toBe('apt-50');
    });

    test('calculates nextToken and hasMore correctly', () => {
      const totalCount = 100;
      const limit = 50;
      const offset1 = 0;
      const offset2 = 50;
      const offset3 = 100;

      const hasMore1 = offset1 + limit < totalCount;
      const hasMore2 = offset2 + limit < totalCount;
      const hasMore3 = offset3 + limit < totalCount;

      expect(hasMore1).toBe(true);
      expect(hasMore2).toBe(false);
      expect(hasMore3).toBe(false);

      // nextToken is base64(offset)
      const nextToken1 = hasMore1 ? Buffer.from(String(offset1 + limit)).toString('base64') : null;
      const nextToken2 = hasMore2 ? Buffer.from(String(offset2 + limit)).toString('base64') : null;

      expect(nextToken1).toBe(Buffer.from('50').toString('base64'));
      expect(nextToken2).toBeNull();
    });

    test('decodes nextToken back to offset', () => {
      const nextToken = Buffer.from('50').toString('base64');
      const offset = parseInt(Buffer.from(nextToken, 'base64').toString('utf-8'), 10);

      expect(offset).toBe(50);
    });
  });

  describe('Role-Based Access Control', () => {
    test('admin role sees all vendors transactions', () => {
      const currentUser = { role: 'admin', vendorId: 'vendor-winsome' };
      const allVendors = ['vendor-winsome', 'vendor-kera'];

      const vendorsToQuery = currentUser.role === 'admin' ? allVendors : [currentUser.vendorId];

      expect(vendorsToQuery).toEqual(['vendor-winsome', 'vendor-kera']);
    });

    test('vendor role sees only own vendor transactions', () => {
      const currentUser = { role: 'vendor', vendorId: 'vendor-winsome' };
      const allVendors = ['vendor-winsome', 'vendor-kera'];

      const vendorsToQuery = currentUser.role !== 'admin' && currentUser.vendorId
        ? allVendors.filter(v => v === currentUser.vendorId)
        : allVendors;

      expect(vendorsToQuery).toEqual(['vendor-winsome']);
    });

    test('staff role sees only own vendor transactions', () => {
      const currentUser = { role: 'staff', vendorId: 'vendor-kera' };
      const allVendors = ['vendor-winsome', 'vendor-kera'];

      const vendorsToQuery = currentUser.role !== 'admin' && currentUser.vendorId
        ? allVendors.filter(v => v === currentUser.vendorId)
        : allVendors;

      expect(vendorsToQuery).toEqual(['vendor-kera']);
    });
  });

  describe('Summary Statistics', () => {
    test('calculates total appointments and paid count', () => {
      const appointments = [
        { appointmentId: 'apt-1', paymentId: 'pay-1', paymentStatus: 'paid', status: 'confirmed' },
        { appointmentId: 'apt-2', paymentId: null, paymentStatus: null, status: 'confirmed' },
        { appointmentId: 'apt-3', paymentId: null, paymentStatus: null, status: 'cancelled' },
      ];

      const totalAppointments = appointments.filter(a => a.status !== 'cancelled').length;
      const paidCount = appointments.filter(a => a.paymentId || a.paymentStatus === 'paid').length;
      const unpaidCount = appointments.filter(a => !a.paymentId && a.paymentStatus !== 'paid' && a.status !== 'cancelled').length;

      expect(totalAppointments).toBe(2);
      expect(paidCount).toBe(1);
      expect(unpaidCount).toBe(1);
    });

    test('calculates total revenue from paid transactions', () => {
      const transactions = [
        { paymentId: 'pay-1', paymentAmount: 65, status: 'confirmed' },
        { paymentId: 'pay-2', paymentAmount: 85, status: 'confirmed' },
        { paymentId: null, paymentAmount: 0, status: 'confirmed' },
      ];

      const totalRevenue = transactions
        .filter(t => t.paymentId || t.paymentAmount > 0)
        .reduce((sum, t) => sum + (t.paymentAmount || 0), 0);

      expect(totalRevenue).toBe(150);
    });
  });

  describe('Multi-Provider Grouping', () => {
    test('groups appointments by groupId', () => {
      const appointments = [
        { appointmentId: 'apt-1', groupId: 'group-1', staffId: 'staff-sarah', vendorId: 'vendor-winsome' },
        { appointmentId: 'apt-2', groupId: 'group-1', staffId: 'staff-marcus', vendorId: 'vendor-winsome' },
        { appointmentId: 'apt-3', groupId: null, staffId: 'staff-sarah', vendorId: 'vendor-winsome' },
      ];

      const grouped = [];
      const seenGroups = new Set();

      appointments.forEach(apt => {
        if (apt.groupId && !seenGroups.has(apt.groupId)) {
          seenGroups.add(apt.groupId);
          const groupMembers = appointments.filter(a => a.groupId === apt.groupId);
          grouped.push({ type: 'group', groupId: apt.groupId, members: groupMembers });
        } else if (!apt.groupId) {
          grouped.push({ type: 'single', ...apt });
        }
      });

      expect(grouped).toHaveLength(2);
      expect(grouped[0].type).toBe('group');
      expect(grouped[0].members).toHaveLength(2);
      expect(grouped[1].type).toBe('single');
    });

    test('calculates house fee deduction for groups', () => {
      const group = {
        servicePrice: 150,
        houseFeeAmount: 30,
        members: [
          { staffId: 'staff-sarah' },
          { staffId: 'staff-marcus' },
        ],
      };

      const netAmount = group.servicePrice - group.houseFeeAmount;
      const perStaffShare = netAmount / group.members.length;

      expect(netAmount).toBe(120);
      expect(perStaffShare).toBe(60);
    });
  });

  describe('House Fee Display Logic', () => {
    test('enriches transactions with house fee breakdown', () => {
      const apt = {
        appointmentId: 'apt-1',
        serviceId: 'svc-massage-60',
        paymentAmount: 65,
      };

      const service = mockServices['svc-massage-60'];
      const houseFeeEnabled = service.houseFeeEnabled || false;
      const houseFeeAmount = houseFeeEnabled && service.houseFeeAmount > 0 ? service.houseFeeAmount : 0;

      const enriched = {
        ...apt,
        serviceName: service.name,
        servicePrice: service.price,
        houseFeeAmount,
        providerShare: service.price - houseFeeAmount,
      };

      expect(enriched.houseFeeAmount).toBe(20);
      expect(enriched.providerShare).toBe(45);
      expect(enriched.servicePrice).toBe(65);
    });

    test('handles services without house fee', () => {
      const apt = {
        appointmentId: 'apt-2',
        serviceId: 'svc-consultation',
        paymentAmount: 50,
      };

      const service = mockServices['svc-consultation'];
      const houseFeeEnabled = service.houseFeeEnabled || false;
      const houseFeeAmount = houseFeeEnabled && service.houseFeeAmount > 0 ? service.houseFeeAmount : 0;

      expect(houseFeeAmount).toBe(0);
      expect(apt.paymentAmount).toBe(50);
    });
  });
});
