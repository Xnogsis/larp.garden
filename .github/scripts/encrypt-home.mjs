import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {encryptHTML} from 'pagecrypt/core';

const home = await readFile('home.html', 'utf8');
const template = await readFile('index.html', 'utf8');
const stamp = `<!-- home-source-sha256: ${createHash('sha256').update(home).update(template).digest('hex')} -->`;
const output = '.github/encrypted-home.html';

if (process.argv.includes('--check')) {
    if (!(await readFile(output, 'utf8')).startsWith(stamp + '\n')) {
        throw new Error('Homepage changed: regenerate the encrypted homepage with PAGECRYPT_PASSWORD set.');
    }
    console.log('Encrypted homepage matches its source.');
} else {
    if (!process.env.PAGECRYPT_PASSWORD) throw new Error('Set PAGECRYPT_PASSWORD before encrypting the homepage.');
    const encrypted = await encryptHTML(home, process.env.PAGECRYPT_PASSWORD);
    const script = encrypted.match(/<script\b[^>]*>[\s\S]*?<\/script>/)?.[0];
    const payload = encrypted.match(/<pre\b[^>]*data-i=[^>]*>[\s\S]*?<\/pre>/)?.[0];
    if (!script || !payload) throw new Error('Unrecognized PageCrypt output.');
    const page = template.replace('<!-- PAGECRYPT_SCRIPT -->', () => script.replace('Wrong password.', 'nope'))
        .replace('<!-- PAGECRYPT_PAYLOAD -->', () => payload);
    await writeFile(output, stamp + '\n' + page);
    console.log('Encrypted homepage generated; password was not saved.');
}
