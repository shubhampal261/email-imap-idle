import Imap, { ImapMessage, ImapFetch } from 'imap';
import { simpleParser, ParsedMail, Attachment } from 'mailparser';
import * as fs from 'fs';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const imapConfig: Imap.Config = {
  user: process.env.IMAP_USER,
  password: process.env.IMAP_PASSWORD,
  host: process.env.IMAP_HOST,
  port: parseInt(process.env.IMAP_PORT || '993'),
  tls:  process.env.TLS_ENABLED === 'true',
  tlsOptions: {
    rejectUnauthorized: false,
  },
};
const imap = new Imap(imapConfig);

function openInbox(callback: (err: Error | null, box: Imap.Box) => void): void {
  imap.openBox('INBOX', false, callback);
}

function parseMessage(msg: ImapMessage): void {
  let buffer = '';

  msg.on('body', (stream: NodeJS.ReadableStream) => {
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
    });

    stream.once('end', async () => {
      try {
        const parsed: ParsedMail = await simpleParser(buffer);
        console.log('📧 New Email:');
        console.log(`From: ${parsed.from?.text}`);
        console.log(`Date: ${parsed.date}`);
        console.log(`Subject: ${parsed.subject}`);
        console.log(`Text: ${parsed.text}`);
        parsed.attachments?.forEach((attachment: Attachment, index: number) => {
          console.log(`Attachment ${index + 1}: ${attachment.filename}`);
          // console.log(`Content-Type ${index + 1}: ${attachment.contentType}`);
          // console.log(`Content-Disposition ${index + 1}: ${attachment.contentDisposition}`);
          // console.log(`size ${index + 1}: ${attachment.size}`);
          // console.log(`Content-ID ${index + 1}: ${attachment.contentId}`);
          const outPutDirPath = `src/attachments/${parsed.subject?.toLowerCase?.()?.replace?.(/\s+/g, '_') + "_" + new Date(parsed.date || new Date()).toISOString().replace(/[\-\:\.]/g, '')}`;
          if (!fs.existsSync(outPutDirPath)) {
            fs.mkdirSync(outPutDirPath);
          }
          // const outPutFileName = `${parsed.subject?.toLowerCase?.()?.replace?.(/\s+/g, '_') + "_" + new Date().toISOString().replace(/-:/g, '')}_attachment_${index + 1}.${attachment.contentType.split('/')[1]}`;
          const outputFilePath = `${outPutDirPath}/${attachment.filename}`;
          fs.writeFileSync(outputFilePath, Buffer.from(attachment.content));

          /**
           * write logic to process the attachment file here
           */
          // axios.post('http://localhost:3000/api/v1/process-attachment', {
          //   attachment: attachment.content,
          //   subject: parsed.subject,
          //   date: parsed.date,
          //   from: parsed.from?.text,
          // }, {
          //   headers: { token: token }
          // });

        });
      } catch (err) {
        console.error('❌ Failed to parse email:', err);
      }
      console.log();
    });
  });

  msg.once('attributes', (attrs: Imap.ImapMessageAttributes) => {
    const uid = attrs.uid;
    imap.addFlags(uid, ['\\Seen'], (err) => {
      if (err) console.error('❌ Error marking as read:', err);
      else console.log('✅ Marked as read:', uid);
    });
  });
}

function getSearchCriteria() {
  // return ['UNSEEN'];
  return [['SENTSINCE', new Date(Date.now() - 1000 * 60 * 60 * 24)]]; // last 24 hours
}

imap.once('ready', () => {
  openInbox((err, box) => {
    if (err) {
      throw err;
    }

    imap.search(
      getSearchCriteria(),
      (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
          const fetch: ImapFetch = imap.fetch(results, { bodies: '' });
          fetch.on('message', parseMessage);
        } else {
          console.log('No unread messages.');
        }
      });

    // IDLE for new mail
    imap.on('mail', (numNewMsgs: number) => {
      console.log(`📥 ${numNewMsgs} new message(s) received`);
      const seq = `${box.messages.total}:${box.messages.total}`;
      const fetch: ImapFetch = imap.seq.fetch(seq, { bodies: '' });
      fetch.on('message', parseMessage);
    });
  });
});

imap.once('error', (err: Error) => {
  console.error('❌ IMAP Error:', err);
});

imap.once('end', () => {
  console.log('🔌 Connection ended');
});

imap.connect();
