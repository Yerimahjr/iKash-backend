import { Keypair } from '@stellar/stellar-sdk';

const kp = Keypair.random();
const challenge = 'random-challenge-123';
const sig = kp.sign(Buffer.from(challenge));
const sigBase64 = sig.toString('base64');

const isValid = kp.verify(Buffer.from(challenge), Buffer.from(sigBase64, 'base64'));
console.log({ isValid, pub: kp.publicKey() });
