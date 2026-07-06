import { Router } from 'express';
import multer from 'multer';
import { ImportController } from '../controllers/import.controller';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 20 * 1024 * 1024 // 20 MB file size limit
  }
});

const controller = new ImportController();

// Parse CSV file endpoint
router.post('/parse', upload.single('file'), controller.parseCsvFile);

// Start AI mapping extraction endpoint
router.post('/extract', controller.startExtraction);

// SSE Progress endpoint
router.get('/status/:jobId', controller.streamJobStatus);

export default router;
