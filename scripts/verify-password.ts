import bcrypt from 'bcryptjs';

const HASH = '$2b$12$ssPASK9rbds.ouTrryR3l.uDlCPpeKQIUEuOomizD5c6jYcPp0t/6';
const r1 = await bcrypt.compare('Strop459', HASH);
const r2 = await bcrypt.compare('459', HASH);
console.log("'Strop459' matches new hash:", r1);
console.log("'459' matches new hash:", r2);
