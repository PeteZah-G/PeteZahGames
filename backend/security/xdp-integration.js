
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const xdpBlocks = new Map();
const MAX_XDP_BLOCKS = 100; 
export async function blockIPKernel(ip, shield) {
  if (!ip || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return false;
  }
  
  if (xdpBlocks.has(ip)) {
    return true;
  }
  
  if (xdpBlocks.size >= MAX_XDP_BLOCKS) {
    console.log(`[XDP] Max blocks reached (${MAX_XDP_BLOCKS}), not blocking ${ip}`);
    return false;
  }
  
  try {
    const { stdout, stderr } = await execAsync(`sudo /usr/local/bin/xdp-block-ip.sh ${ip} block`);
    
    if (stdout.includes('Blocked')) {
      xdpBlocks.set(ip, Date.now());
      
      setTimeout(() => {
        xdpBlocks.delete(ip);
      }, 3600000);
      
      console.log(`[XDP] ⛔ Kernel-blocked ${ip}`);
      if (shield) {
        shield.sendLog(`⛔ **XDP KERNEL BLOCK**: ${ip}`, null);
      }
      return true;
    } else if (stdout.includes('whitelisted')) {
      console.log(`[XDP] Attempted to block whitelisted IP: ${ip}`);
      return false;
    }
    
    return false;
  } catch (err) {
    console.error(`[XDP] Failed to block ${ip}:`, err.message);
    return false;
  }
}

export async function getXDPStats() {
  try {
    const { stdout } = await execAsync('sudo xdp-filter status 2>/dev/null');
    return stdout;
  } catch (err) {
    return 'XDP stats unavailable';
  }
}

export function getXDPBlockCount() {
  return xdpBlocks.size;
}
