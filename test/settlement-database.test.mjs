import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const lender='00000000-0000-4000-8000-000000000001';
const borrower='00000000-0000-4000-8000-000000000002';
const loan='00000000-0000-4000-8000-000000000003';
const first='00000000-0000-4000-8000-000000000004';
const second='00000000-0000-4000-8000-000000000005';
const sender='G'+'A'.repeat(55), recipient='G'+'B'.repeat(55), issuer='G'+'C'.repeat(55);
const hash='a'.repeat(64), receipt='0x'+'b'.repeat(64), contract='0x'+'c'.repeat(40);
const rpc=async (sql,args=[]) => (await db.query(sql,args)).rows;
before(async()=>{
 db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';`);
 const base=(await readFile(new URL('../../Supabase.sql',import.meta.url),'utf8')).replace(/CREATE EXTENSION IF NOT EXISTS[^;]+;/g,'');
 await db.exec(base);
 await db.exec(await readFile(new URL('../migrations/20260912_pollar_settlements.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../migrations/20260912_pollar_settlements.sql',import.meta.url),'utf8'));
});
after(async()=>{await db?.close()});
beforeEach(async()=>{
 await db.exec('TRUNCATE public.profiles CASCADE');
 await rpc(`INSERT INTO profiles(id,role,alias_name) VALUES($1,'LENDER','test-lender'),($2,'BORROWER','test-borrower')`,[lender,borrower]);
 await rpc(`INSERT INTO loans(id,hsk_loan_id,loan_hash,lender_id,borrower_id,capital,currency,total_installments,installment_amount,frequency,settlement_network)
 VALUES($1,$2,$3,$4,$5,2,'USDC',2,1,'WEEKLY','stellar:testnet')`,[loan,'0x'+'1'.repeat(64),'0x'+'2'.repeat(64),lender,borrower]);
 await rpc(`INSERT INTO installments(id,loan_id,installment_number,amount,principal_amount,due_date) VALUES($1,$3,1,1,1,current_date),($2,$3,2,1,1,current_date)`,[first,second,loan]);
 await rpc(`INSERT INTO pollar_wallet_routes(profile_id,network,address) VALUES($1,'stellar:testnet',$2)`,[lender,recipient]);
});
async function create(id=first,actor=borrower){return (await rpc('SELECT * FROM pollar_create_intent($1,$2,$3,$4,100,$5)',[id,actor,sender,issuer,contract]))[0]}
async function settle(intent,tx=hash,proof=receipt){await rpc('SELECT pollar_observe($1,$2,$3)',[intent.id,borrower,tx]);return rpc('SELECT * FROM pollar_settle($1,$2,$3,now())',[intent.id,tx,proof])}
test('intent is idempotent and fixes amount, recipient and network from the database',async()=>{
 const a=await create(),b=await create(); assert.equal(a.id,b.id); assert.equal(Number(a.amount),1); assert.equal(a.recipient,recipient);
 await rpc('UPDATE pollar_wallet_routes SET address=$1',['G'+'D'.repeat(55)]);
 assert.equal((await create()).recipient,recipient);
 await assert.rejects(rpc('UPDATE pollar_payment_intents SET amount=2 WHERE id=$1',[a.id]),/INTENCION_INMUTABLE/);
 await assert.rejects(rpc('UPDATE installments SET amount=2 WHERE id=$1',[first]),/CUOTA_INMUTABLE/);
});
test('unauthorized actor, BOB and out-of-order installments cannot create an intent',async()=>{
 await assert.rejects(create(first,lender),/CUOTA_NO_AUTORIZADA/);
 await assert.rejects(create(first,null),/CUOTA_NO_AUTORIZADA/);
 await assert.rejects(create(second),/CUOTA_ANTERIOR_PENDIENTE/);
 await rpc("UPDATE loans SET currency='BOB'"); await assert.rejects(create(),/CUOTA_NO_DISPONIBLE/);
});
test('duplicate confirmation is atomic and completes the loan only after all installments',async()=>{
 const a=await create(); await settle(a); await settle(a);
 let rows=await rpc('SELECT status,hsk_sync_status,pollar_chain_id,pollar_network FROM installments WHERE id=$1',[first]);
 assert.equal(rows[0].status,'PAID'); assert.equal(rows[0].hsk_sync_status,'PENDING'); assert.equal(rows[0].pollar_chain_id,null);
 assert.equal((await rpc('SELECT status FROM loans'))[0].status,'ACTIVE');
 await assert.rejects(create(second),/CUOTA_ANTERIOR_PENDIENTE/);
 await rpc('SELECT pollar_mark_anchored($1,NULL)',[a.id]);
 const b=await create(second); await settle(b,'c'.repeat(64),'0x'+'d'.repeat(64));
 assert.equal((await rpc('SELECT status FROM loans'))[0].status,'COMPLETED');
});
test('a transaction cannot pay a second installment and conflict rolls back',async()=>{
 const a=await create(); await settle(a); await rpc('SELECT pollar_mark_anchored($1,NULL)',[a.id]);
 const b=await create(second); await assert.rejects(settle(b,hash,'0x'+'e'.repeat(64)),/unique/i);
 assert.equal((await rpc('SELECT status FROM installments WHERE id=$1',[second]))[0].status,'PENDING');
 assert.equal((await rpc('SELECT status FROM pollar_payment_intents WHERE id=$1',[b.id]))[0].status,'CREATED');
});
test('cash and Pollar reservations exclude each other before external calls',async()=>{
 await create(); await assert.rejects(rpc('SELECT libreta_claim_cash($1)',[first]),/CUOTA_RESERVADA_O_PAGADA/);
 await assert.rejects(rpc("UPDATE installments SET status='PAID',paid_date=now(),payment_method='CASH',receipt_hash=$2 WHERE id=$1",[first,receipt]),/PAGO_SIN_VERIFICAR/);
 await rpc('SELECT libreta_claim_cash($1)',[second]);
 await rpc("UPDATE installments SET status='PAID',paid_date=now(),payment_method='CASH',receipt_hash=$2,hsk_sync_status='SYNCED' WHERE id=$1",[second,receipt]);
 await assert.rejects(rpc("UPDATE installments SET status='PENDING',paid_date=NULL WHERE id=$1",[second]),/PAGO_INMUTABLE/);
});
test('anonymous clients cannot mutate intents or call settlement RPC',async()=>{
 await create(); await db.exec('SET ROLE anon');
 try { await assert.rejects(rpc('SELECT * FROM pollar_payment_intents'),/permission denied/); await assert.rejects(rpc('SELECT pollar_settle($1,$2,$3,now())',[first,hash,receipt]),/permission denied/); }
 finally {await db.exec('RESET ROLE')}
});
test('pending candidate is durable and duplicate observations do not multiply work',async()=>{
 const a=await create(); await rpc('SELECT pollar_observe($1,$2,$3)',[a.id,borrower,hash]); await rpc('SELECT pollar_observe($1,$2,$3)',[a.id,borrower,hash]);
 assert.equal((await rpc('SELECT * FROM pollar_payment_candidates')).length,1);
 assert.equal((await rpc('SELECT status FROM installments WHERE id=$1',[first]))[0].status,'PENDING');
});
