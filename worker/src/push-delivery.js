// A bounded retry can resume failed endpoints without alerting successful ones again.
export async function deliverPush(env, key, payload, {send, now = () => Date.now()} = {}) {
  const rows = (await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions').all()).results || [];
  const counts = {registered:rows.length,delivered:0,failed:0,removed:0,alreadyDelivered:0};
  for (let offset = 0; offset < rows.length; offset += 5) {
    const results = await Promise.all(rows.slice(offset,offset+5).map(async row => {
      const at=now(),iso=new Date(at).toISOString();
      const claim=await env.DB.prepare(
        "INSERT INTO push_deliveries (notification_key,endpoint,state,attempts,lease_until_ms,updated_at) VALUES (?,?,'SENDING',1,?,?) " +
        "ON CONFLICT(notification_key,endpoint) DO UPDATE SET state='SENDING',attempts=attempts+1,lease_until_ms=excluded.lease_until_ms,updated_at=excluded.updated_at " +
        "WHERE push_deliveries.state NOT IN ('SENT','GONE') AND (push_deliveries.state!='SENDING' OR push_deliveries.lease_until_ms<=?) AND push_deliveries.attempts<3 RETURNING state"
      ).bind(key,row.endpoint,at+60000,iso,at).first();
      if(!claim){
        const previous=await env.DB.prepare('SELECT state FROM push_deliveries WHERE notification_key=? AND endpoint=?').bind(key,row.endpoint).first();
        return previous?.state==='SENT'?'ALREADY_SENT':previous?.state==='GONE'?'GONE':'FAILED';
      }
      let state;
      try {state=await send(env,{endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},payload)?'SENT':'GONE';}
      catch {state='FAILED';}
      await env.DB.prepare('UPDATE push_deliveries SET state=?,lease_until_ms=0,updated_at=? WHERE notification_key=? AND endpoint=?')
        .bind(state,new Date(now()).toISOString(),key,row.endpoint).run();
      if(state==='GONE')await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(row.endpoint).run();
      return state;
    }));
    for(const state of results){
      if(state==='SENT'||state==='ALREADY_SENT'){counts.delivered++;if(state==='ALREADY_SENT')counts.alreadyDelivered++;}
      else if(state==='GONE')counts.removed++;
      else counts.failed++;
    }
  }
  return counts;
}
