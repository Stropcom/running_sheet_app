import bcrypt from 'bcryptjs';

const HASH = '$2b$12$ANgp3CSxVDeIt7nlRzns6eNUP5JXZqCJ3v9CyJmfZ62548vKIaQvS';
const r1 = await bcrypt.compare('dexter503', HASH);
const r2 = await bcrypt.compare('dexter', HASH);
console.log("'dexter503' matches:", r1);
console.log("'dexter' matches:", r2);
