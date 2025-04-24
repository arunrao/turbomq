import { JobHandler } from '../../../src/index';

// Define task handlers that will be used across the application
export const taskHandlers: Record<string, JobHandler> = {
  // Email sending task
  sendEmail: async (payload, helpers) => {
    console.log('Processing email job:', payload);
    
    // Update progress as the job runs
    await helpers.updateProgress(25);
    console.log('Connecting to email service...');
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await helpers.updateProgress(50);
    console.log('Sending email...');
    
    // Simulate some more work
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await helpers.updateProgress(100);
    console.log('Email sent successfully!');
    
    // Return the result
    return {
      success: true,
      messageId: `msg_${Date.now()}`,
      sentAt: new Date().toISOString()
    };
  },
  
  // Image processing task
  processImage: async (payload, helpers) => {
    console.log('Processing image:', payload);
    
    await helpers.updateProgress(25);
    console.log('Loading image...');
    
    // Simulate image loading
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await helpers.updateProgress(50);
    console.log('Applying transformations...');
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await helpers.updateProgress(75);
    console.log('Saving processed image...');
    
    // Simulate saving
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await helpers.updateProgress(100);
    console.log('Image processing complete!');
    
    return {
      success: true,
      processedUrl: `https://example.com/processed/${payload.imageId}`,
      metadata: {
        width: payload.width || 800,
        height: payload.height || 600,
        format: payload.format || 'webp'
      }
    };
  },
  
  // Data import task
  importData: async (payload, helpers) => {
    console.log('Starting data import:', payload);
    const totalRecords = payload.records?.length || 100;
    let processedRecords = 0;
    
    await helpers.updateProgress(5);
    console.log('Validating data...');
    
    // Simulate validation
    await new Promise(resolve => setTimeout(resolve, 800));
    
    await helpers.updateProgress(20);
    console.log('Preparing database...');
    
    // Simulate database preparation
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Process records in batches
    const batchSize = 20;
    const batches = Math.ceil(totalRecords / batchSize);
    
    for (let i = 0; i < batches; i++) {
      // Simulate batch processing
      await new Promise(resolve => setTimeout(resolve, 300));
      
      processedRecords += Math.min(batchSize, totalRecords - processedRecords);
      const progress = Math.floor((processedRecords / totalRecords) * 80) + 20;
      
      await helpers.updateProgress(progress);
      console.log(`Imported ${processedRecords}/${totalRecords} records`);
    }
    
    await helpers.updateProgress(100);
    console.log('Data import complete!');
    
    return {
      success: true,
      recordsProcessed: processedRecords,
      errors: [],
      completedAt: new Date().toISOString()
    };
  },
  
  // Report generation task
  generateReport: async (payload, helpers) => {
    console.log('Generating report:', payload);
    
    await helpers.updateProgress(10);
    console.log('Gathering data...');
    
    // Simulate data gathering
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    await helpers.updateProgress(40);
    console.log('Analyzing data...');
    
    // Simulate analysis
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await helpers.updateProgress(70);
    console.log('Formatting report...');
    
    // Simulate formatting
    await new Promise(resolve => setTimeout(resolve, 800));
    
    await helpers.updateProgress(90);
    console.log('Finalizing report...');
    
    // Simulate finalization
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await helpers.updateProgress(100);
    console.log('Report generation complete!');
    
    return {
      success: true,
      reportUrl: `https://example.com/reports/${payload.reportId || Date.now()}`,
      generatedAt: new Date().toISOString(),
      pageCount: Math.floor(Math.random() * 20) + 5
    };
  }
};
