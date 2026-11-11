import dns from 'node:dns';
import { isIP } from 'node:net';

/** Changes this Node process only; never changes Windows/system DNS settings. */
export function configureMongoDns(value=process.env.MONGODB_DNS_SERVERS) {
  if(!value?.trim())return [];
  const servers=value.split(',').map(s=>s.trim()).filter(Boolean);
  if(!servers.length||servers.some(s=>!isIP(s)))throw new Error('MONGODB_DNS_SERVERS must be comma-separated DNS server IP addresses.');
  const current=dns.getServers();
  if(current.join(',')!==servers.join(','))dns.setServers(servers);
  return servers;
}

export function mongoConnectionMessage(error) {
  const code=error?.code||error?.cause?.code;
  const description=`${error?.message||''} ${error?.cause?.message||''}`;
  if(/querySrv|queryTxt|DNS|ENOTFOUND|ECONNREFUSED|ETIMEOUT/.test(description)||['ENOTFOUND','ECONNREFUSED','ETIMEOUT'].includes(code)) {
    return 'MongoDB DNS discovery failed before authentication. Run npm run db:check. Try MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8, or copy the exact non-SRV mongodb:// connection string from Atlas Connect > Drivers. Do not invent node hostnames.';
  }
  if(error?.code===18||/authentication failed|bad auth/i.test(description))return 'MongoDB authentication failed. Check the Atlas database user and URL-encode special characters in its URI password.';
  if(/server selection|timed out|timeout/i.test(description))return 'MongoDB could not reach an eligible server. Check Atlas cluster status, Network Access and outbound TCP port 27017. Run npm run db:check.';
  return 'MongoDB connection failed. Check Atlas configuration and run npm run db:check. Credentials have not been printed.';
}
