import { useState } from 'react';
import Users from '../users/Users.jsx';

export default function Settings() {
  return (
    <div className="space-y-10">
      <Users embedded />
    </div>
  );
}
