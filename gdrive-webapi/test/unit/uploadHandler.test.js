import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import TestUtil from '../_util/testUtil.js';
import UploadHandler from './../../src/uploadHandler.js';
import fs from 'fs';
import { resolve } from 'path';
import { pipeline } from 'stream/promises';
import { logger } from '../../src/logger.js';

describe('#Upload Handler test suite', () => {
    const ioObj = {
        to: (id) => ioObj,
        emit: (event, message) => {}
    };

    beforeEach(() => {
        jest.spyOn(logger, 'info').mockImplementation();
    });

    describe('#canExecute', () => {
        test('should return true when time is later than specified delay', () => {
            const executionDelay = 1000;
            const uploadHandler = new UploadHandler({ io: {}, socketId: '', messageTimeDelay: executionDelay });

            const currentExecution = TestUtil.getTimeFromDate('2021-09-11 00:00:03');

            TestUtil.mockDateNow([currentExecution]);

            const lastExecution = TestUtil.getTimeFromDate('2021-09-11 00:00:00');

            const result = uploadHandler.canExecute(lastExecution);

            expect(result).toBeTruthy();
        });

        test('should return false when time is not later than specified delay', () => {
            const executionDelay = 3000;
            const uploadHandler = new UploadHandler({ io: {}, socketId: '', messageTimeDelay: executionDelay });

            const currentExecution = TestUtil.getTimeFromDate('2021-09-11 00:00:02');

            TestUtil.mockDateNow([currentExecution]);

            const lastExecution = TestUtil.getTimeFromDate('2021-09-11 00:00:01');

            const result = uploadHandler.canExecute(lastExecution);

            expect(result).toBeFalsy();
        });
    });

    describe('#handleFileBytes', () => {
        test('should call emit function and it is a transform stream', async () => {
            jest.spyOn(ioObj, ioObj.to.name);
            jest.spyOn(ioObj, ioObj.emit.name);

            const handler = new UploadHandler({
                io: ioObj,
                socketId: '01'
            });

            jest.spyOn(handler, handler.canExecute.name).mockReturnValueOnce(true);

            const message = ['hello'];
            const source = TestUtil.generateReadableStrem(message);
            const onWrite = jest.fn();
            const target = TestUtil.generateWritableStream(onWrite);

            await pipeline(source, handler.handleFileBytes('filename.txt'), target);

            expect(ioObj.to).toHaveBeenCalledTimes(message.length);
            expect(ioObj.emit).toHaveBeenCalledTimes(message.length);
            expect(onWrite).toHaveBeenCalledTimes(message.length);
            expect(onWrite.mock.calls.join()).toEqual(message.join());
        });

        test('given message timerDelay as 2secs it should emit only two messages during 2 seconds', async () => {
            jest.spyOn(ioObj, ioObj.emit.name);

            const day = '2021-07-01 01:01';
            const onFirstLastMessageSent = TestUtil.getTimeFromDate(`${day}:00`);
            const onFirstCanExecute = TestUtil.getTimeFromDate(`${day}:02`);
            const onSecondUpdateLastMessageSent = onFirstCanExecute;
            const onSecondCanExecute = TestUtil.getTimeFromDate(`${day}:03`);
            const onThirdCanExecute = TestUtil.getTimeFromDate(`${day}:04`);

            TestUtil.mockDateNow([onFirstLastMessageSent, onFirstCanExecute, onSecondUpdateLastMessageSent, onSecondCanExecute, onThirdCanExecute]);

            const filename = 'filename.avi';
            const messages = ['hello', 'hello', 'world'];
            const expectedMessageSent = 2;
            const twoSecondsPeriod = 2000;
            const source = TestUtil.generateReadableStrem(messages);
            const handler = new UploadHandler({
                io: ioObj,
                socketId: '01',
                messageTimeDelay: twoSecondsPeriod
            });

            await pipeline(source, handler.handleFileBytes(filename));

            expect(ioObj.emit).toHaveBeenCalledTimes(expectedMessageSent);

            const [firstCallResult, secondCallResult] = ioObj.emit.mock.calls;

            expect(firstCallResult).toEqual([handler.ON_UPLOAD_EVENT, { processedAlready: 'hello'.length, filename }]);
            expect(secondCallResult).toEqual([handler.ON_UPLOAD_EVENT, { processedAlready: messages.join('').length, filename }]);
        });
    });

    describe('#onFile', () => {
        test('given a stream file it should save it on disk', async () => {
            const chunks = ['hey', 'dude'];
            const downloadsFolder = '/tmp';
            const handler = new UploadHandler({
                io: ioObj,
                socketId: '01',
                downloadsFolder
            });

            const onData = jest.fn();
            const onTransform = jest.fn();

            jest.spyOn(fs, fs.createWriteStream.name).mockImplementation(() => TestUtil.generateWritableStream(onData));
            jest.spyOn(handler, handler.handleFileBytes.name).mockImplementation(() => TestUtil.generateTransformStream(onTransform));

            const params = {
                fieldname: 'video',
                file: TestUtil.generateReadableStrem(chunks),
                filename: 'mockFile.txt'
            };

            await handler.onFile(...Object.values(params));

            expect(onData.mock.calls.join()).toEqual(chunks.join());
            expect(onTransform.mock.calls.join()).toEqual(chunks.join());

            const expectedFilename = resolve(handler.downloadsFolder, params.filename);

            expect(fs.createWriteStream).toHaveBeenCalledWith(expectedFilename);
        });
    });

    describe('#registerEvents', () => {
        test('should call onFile and onFinish functions on Busboy instance', async () => {
            const uploadHandler = new UploadHandler({ io: ioObj, socketId: '01' });

            jest.spyOn(uploadHandler, uploadHandler.onFile.name).mockResolvedValue();

            const headers = {
                'content-type': 'multipart/form-data; boundary='
            };

            const onFinish = jest.fn();

            const busboyInstance = uploadHandler.registerEvents(headers, onFinish);

            const fileStream = TestUtil.generateReadableStrem(['chunk', 'of', 'data']);

            busboyInstance.emit('file', 'fieldName', fileStream, 'testFile.txt');
            busboyInstance.listeners('finish')[0].call();

            expect(uploadHandler.onFile).toHaveBeenCalled();
            expect(onFinish).toHaveBeenCalled();
        });
    });
});
