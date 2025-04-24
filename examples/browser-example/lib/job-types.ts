import { JobType } from '../../../src/job-registry';
import { JobHandler } from '../../../src/types';

// Define your project-specific job handlers
const processFileHandler: JobHandler = async (payload, _helpers) => {
  console.log('Processing file:', payload);
  // Simulate processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  return { success: true, message: 'File processed successfully' };
};

const sendEmailHandler: JobHandler = async (payload, _helpers) => {
  console.log('Sending email:', payload);
  // Email sending logic here
  return { success: true, message: 'Email sent successfully' };
};

const generateReportHandler: JobHandler = async (payload, _helpers) => {
  console.log('Generating report:', payload);
  // Report generation logic here
  return { success: true, message: 'Report generated successfully' };
};

const resizeImageHandler: JobHandler = async (payload, helpers) => {
  console.log('Resizing image:', payload);
  // Simulate image processing steps
  await helpers.updateProgress(25);
  // Resize logic would go here
  await helpers.updateProgress(50);
  // Apply filters
  await helpers.updateProgress(75);
  // Save result
  await helpers.updateProgress(100);
  return { 
    success: true, 
    message: 'Image resized successfully',
    dimensions: payload.dimensions
  };
};

// Define your project-specific job types
export const projectJobTypes: JobType[] = [
  {
    name: 'processFile',
    description: 'Process an uploaded file',
    handler: processFileHandler,
    defaultOptions: {
      maxAttempts: 3,
      priority: 1
    },
    validatePayload: (payload) => {
      return payload && 
             typeof payload.fileName === 'string' && 
             typeof payload.fileSize === 'number';
    }
  },
  {
    name: 'sendEmail',
    description: 'Send an email',
    handler: sendEmailHandler,
    defaultOptions: {
      maxAttempts: 5,
      priority: 2
    },
    validatePayload: (payload) => {
      return payload && 
             typeof payload.to === 'string' && 
             typeof payload.subject === 'string' && 
             typeof payload.body === 'string';
    }
  },
  {
    name: 'generateReport',
    description: 'Generate a report',
    handler: generateReportHandler,
    defaultOptions: {
      maxAttempts: 3,
      priority: 1
    },
    validatePayload: (payload) => {
      return payload && 
             typeof payload.reportType === 'string' && 
             payload.dateRange && 
             typeof payload.dateRange.start === 'string' && 
             typeof payload.dateRange.end === 'string';
    }
  },
  {
    name: 'resizeImage',
    description: 'Resize an image to specified dimensions',
    handler: resizeImageHandler,
    defaultOptions: {
      maxAttempts: 3,
      priority: 2
    },
    validatePayload: (payload) => {
      return payload && 
             typeof payload.imageUrl === 'string' && 
             payload.dimensions && 
             typeof payload.dimensions.width === 'number' && 
             typeof payload.dimensions.height === 'number';
    }
  }
]; 