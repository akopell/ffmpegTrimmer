// require("dotenv").config();
const express = require('express');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);
const PORT = process.env.PORT || 8080;
const app = express();
const logger = require('morgan');
const path = require('path');
const AWS = require('aws-sdk');
AWS.config.update({ region: process.env.AWS_REGION });
const s3 = new AWS.S3();
const fs = require('fs');
fsp = fs.promises;
const multer = require('multer');
const upload = multer();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.put('/', upload.single('video'), async (req, res, next) => {
	console.log(req.file);
	try {
		const name = req.file.originalname;

		await fsp.writeFile(`./old-${name}`, req.file.buffer).then(() => {
			const ffmpegCommand = ffmpeg(`old-${name}`);

			ffmpegCommand
				.format('mp4')
				.setStartTime(req.body.startTime) //Can be in "HH:MM:SS" format also
				.setDuration(3)
				.on('start', function (commandLine) {
					console.log('Spawned FFmpeg with command: ' + commandLine);
				})
				.on('error', function (err) {
					console.log('error: ', err);
					res.send(err);
				})
				.saveToFile(`new-${name}`)
				.on('end', async function (err) {
					if (!err) {
						console.log('conversion Done');
						const uploadParams = {
							Bucket: process.env.BUCKET_NAME,
							Key: `videoClips/${name}`,
							Body: '',
						};
						const file = path.join(__dirname, `new-${name}`);
						const fileStream = fs.createReadStream(file);
						fileStream.on('error', function (err) {
							console.log('File Error', err);
						});
						uploadParams.Body = fileStream;

						s3.upload(uploadParams, function (err, data) {
							try {
								if (err) {
									res.status(400).send('Error: ' + err);
									fs.unlink(`old-${name}`, (err) => {
										if (err) throw err;
									});
									fs.unlink(`new-${name}`, (err) => {
										if (err) throw err;
									});
								}
								if (data) {
									res.status(200).send(data.Location);
									fs.unlink(`old-${name}`, (err) => {
										if (err) throw err;
									});
									fs.unlink(`new-${name}`, (err) => {
										if (err) throw err;
									});
								}
							} catch (err) {
								next(err);
							}
						});
					} else {
						next(err);
					}
				});
		});
	} catch (err) {
		next(err);
	}
});

app.use((err, req, res, next) => {
	console.error(err);
	console.error(err.stack);
	res.status(err.status || 500).send(err.message || 'Internal server error.');
});

app.listen(PORT, () => console.log('listening'));
