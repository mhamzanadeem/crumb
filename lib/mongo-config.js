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
  const syscall=error?.syscall||error?.cause?.syscall;
  const description=`${error?.message||''} ${error?.cause?.message||''}`;
  if(description.includes('HTTPS DNS'))return description.trim();
  if(error?.code===18||/authentication failed|bad auth/i.test(description))return 'MongoDB authentication failed. Check the Atlas database user and URL-encode special characters in its URI password.';
  if(error?.name==='MongoParseError')return 'MongoDB rejected the connection-string format. Check MONGODB_URI without posting credentials in chat.';
  // ECONNREFUSED and ETIMEOUT alone also occur on TCP connections. Only call
  // this a DNS failure when the operation or error text actually identifies DNS.
  if(/querySrv|queryTxt|getaddrinfo|ENOTFOUND|DNS/i.test(description)||/^(querySrv|queryTxt|getaddrinfo)$/.test(syscall||'')) {
    const safeCode=typeof code==='string'&&/^[A-Z_]+$/.test(code)?code:'DNS_ERROR';
    const operation=['querySrv','queryTxt','getaddrinfo'].includes(syscall)?` / ${syscall}`:'';
    return `MongoDB DNS lookup failed (${safeCode}${operation}) before authentication. The URI is passed unchanged to the driver. Run npm run db:check to inspect system DNS; do not change a previously working URI just because of this error.`;
  }
  if(code==='ECONNREFUSED'||/connect ECONNREFUSED/i.test(description))return 'MongoDB server connection was refused (TCP), not a confirmed DNS discovery failure. Check Atlas Network Access, cluster status, VPN/firewall and the reported port. Run npm run db:check.';
  if(/server selection|timed out|timeout/i.test(description))return 'MongoDB could not reach an eligible server. Check Atlas cluster status, Network Access and outbound TCP port 27017. Run npm run db:check.';
  return 'MongoDB connection failed. Check Atlas configuration and run npm run db:check. Credentials have not been printed.';
}
