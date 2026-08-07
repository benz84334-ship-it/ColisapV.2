import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportedMemberPayload } from '../src/utils/memberImport.js';

test('buildImportedMemberPayload maps common spreadsheet columns into a member payload', () => {
  const payload = buildImportedMemberPayload({
    fullName: 'Juan Dela Cruz',
    address: 'Poblacion',
    barangay: 'Sibalom',
    contactNumber: '09171234567',
    membershipDate: '2026-08-01',
    benefitCategory: 'Regular',
    shareCapital: '5000',
  });

  assert.equal(payload.fullName, 'Juan Dela Cruz');
  assert.equal(payload.address, 'Poblacion');
  assert.equal(payload.barangay, 'Sibalom, Antique');
  assert.equal(payload.contactNumber, '09171234567');
  assert.equal(payload.membershipDate, '2026-08-01');
  assert.equal(payload.shareCapital, 5000);
});

test('buildImportedMemberPayload splits first and last names when full name is missing', () => {
  const payload = buildImportedMemberPayload({
    firstName: 'Maria',
    lastName: 'Santos',
    contactNumber: '09181234567',
  });

  assert.equal(payload.firstName, 'Maria');
  assert.equal(payload.lastName, 'Santos');
  assert.equal(payload.fullName, 'Maria Santos');
});
