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

test('buildImportedMemberPayload falls back to generic column names and other non-empty values', () => {
  const payload = buildImportedMemberPayload({
    'Member Name': 'Ana Cruz',
    'Home Address': 'Poblacion',
    'Mobile Number': '09181234567',
  });

  assert.equal(payload.fullName, 'Ana Cruz');
  assert.equal(payload.address, 'Poblacion');
  assert.equal(payload.contactNumber, '09181234567');
});

test('buildImportedMemberPayload accepts generic Name headers from simple spreadsheets', () => {
  const payload = buildImportedMemberPayload({
    Name: 'Rico Santos',
    Address: 'San Jose',
    Contact: '09190001111',
  });

  assert.equal(payload.fullName, 'Rico Santos');
  assert.equal(payload.address, 'San Jose');
  assert.equal(payload.contactNumber, '09190001111');
});
