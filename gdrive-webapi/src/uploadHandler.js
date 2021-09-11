import Busboy from 'busboy';
import { pipeline } from 'stream/promises';
import fs from 'fs';
import { logger } from './logger';

export default class UploadHandler {
    constructor({ io, socketId, downloadsFolder, messageTimeDelay = 200 }) {
        this.io = io;
        this.socketId = socketId;
        this.downloadsFolder = downloadsFolder;
        this.messageTimeDelay = messageTimeDelay;
        this.ON_UPLOAD_EVENT = 'file-upload';
    }

    canExecute(lastExecution) {
        return Date.now() - lastExecution >= this.messageTimeDelay;
    }

    handleFileBytes(filename) {
        this.lastMessageSent = Date.now();

        async function* handleData(source) {
            let processedAlready = 0;

            for await (const chunk of source) {
                yield chunk;

                processedAlready += chunk.length;

                if (!this.canExecute(this.lastMessageSent)) continue;

                this.lastMessageSent = Date.now();

                this.io.to(this.socketId).emit(this.ON_UPLOAD_EVENT, { processedAlready, filename });

                logger.info(`File [${filename}] got ${processedAlready} bytes to ${this.socketId}`);
            }
        }

        return handleData.bind(this);
    }

    async onFile(fieldName, file, filename) {
        const saveTo = `${this.downloadsFolder}/${filename}`;

        await pipeline(
            // 1º passo - pegar uma readable stream.
            file,
            // 2º passo - filtrar, converter e transformar dados.
            this.handleFileBytes.apply(this, [filename]),
            // 3º passo - saída do processo, writable stream.
            fs.createWriteStream(saveTo)
        );

        logger.info(`File [${filename}] upload finished`);
    }

    registerEvents(headers, onFinish) {
        const busboy = new Busboy({ headers });

        busboy.on('file', this.onFile.bind(this));
        busboy.on('finish', onFinish);

        return busboy;
    }
}
