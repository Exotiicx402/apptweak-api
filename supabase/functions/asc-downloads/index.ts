import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base64URL encoding helpers
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str));
}

// Convert PEM to raw key bytes
function pemToBytes(pem: string): Uint8Array {
  const lines = pem.split('\n');
  const base64 = lines
    .filter(line => !line.startsWith('-----'))
    .join('');
  const binary = atob(base64);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

// Generate ES256 JWT for App Store Connect
async function generateJWT(keyId: string, issuerId: string, privateKeyPem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 20 * 60; // 20 minutes

  const header = {
    alg: 'ES256',
    kid: keyId,
    typ: 'JWT',
  };

  const payload = {
    iss: issuerId,
    iat: now,
    exp: exp,
    aud: 'appstoreconnect-v1',
  };

  const headerB64 = base64UrlEncodeString(JSON.stringify(header));
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the private key
  const keyBytes = pemToBytes(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign the data
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${signatureB64}`;
}

// Parse TSV/CSV data
function parseTabularData(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Detect delimiter (tab or comma)
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map(h => h.trim().toLowerCase().replace(/"/g, ''));
  
  const results: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (values[idx] || '').trim().replace(/"/g, '');
    });
    results.push(row);
  }
  return results;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ASC_KEY_ID = Deno.env.get('ASC_KEY_ID');
    const ASC_ISSUER_ID = Deno.env.get('ASC_ISSUER_ID');
    const ASC_PRIVATE_KEY = Deno.env.get('ASC_PRIVATE_KEY');

    if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY) {
      console.error('Missing ASC credentials');
      return new Response(
        JSON.stringify({ error: 'Missing App Store Connect credentials', downloads: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { appId = '6648798962', startDate, endDate } = await req.json();
    console.log(`Fetching ASC downloads for app ${appId} from ${startDate} to ${endDate}`);

    // Generate JWT
    const jwt = await generateJWT(ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY);
    console.log('JWT generated successfully');

    const headers = {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    };

    // Step 1: Create or get report request for this app
    // The API doesn't allow listing report requests, so we create one and handle 409 conflict
    console.log('Creating/getting report request...');
    
    const createRequestUrl = 'https://api.appstoreconnect.apple.com/v1/analyticsReportRequests';
    const createRes = await fetch(createRequestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: {
          type: 'analyticsReportRequests',
          attributes: {
            accessType: 'ONGOING',
          },
          relationships: {
            app: {
              data: {
                type: 'apps',
                id: appId,
              },
            },
          },
        },
      }),
    });

    let reportRequestId: string | null = null;

    if (createRes.ok) {
      const createData = await createRes.json();
      reportRequestId = createData.data.id;
      console.log('Created new report request:', reportRequestId);
      
      // New report requests need time to generate data
      return new Response(
        JSON.stringify({ 
          downloads: [],
          dataDelayed: true,
          message: 'Report request created. Apple data typically takes 24-48 hours to become available.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle conflict (already exists) - we need to get it by looking at the app's report requests
    if (createRes.status === 409) {
      const errorData = await createRes.json();
      console.log('Report request already exists, extracting ID from error...');
      
      // Try to extract the existing report request ID from the error or use app endpoint
      // Use the apps endpoint to get the report requests relationship
      const appUrl = `https://api.appstoreconnect.apple.com/v1/apps/${appId}/analyticsReportRequests`;
      const appRes = await fetch(appUrl, { headers });
      
      if (appRes.ok) {
        const appData = await appRes.json();
        if (appData.data && appData.data.length > 0) {
          // Find ongoing request
          const ongoingReq = appData.data.find((r: any) => r.attributes?.accessType === 'ONGOING');
          reportRequestId = ongoingReq?.id || appData.data[0].id;
          console.log('Found existing report request via app endpoint:', reportRequestId);
        }
      } else {
        console.log('App endpoint also failed, trying alternative...');
      }
    }

    if (!reportRequestId) {
      const errorText = await createRes.text();
      console.error('Failed to create/get report request:', createRes.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to access report requests',
          details: errorText,
          downloads: [],
          dataDelayed: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: List available reports
    const reportsUrl = `https://api.appstoreconnect.apple.com/v1/analyticsReportRequests/${reportRequestId}/reports`;
    console.log('Fetching available reports...');
    
    const reportsRes = await fetch(reportsUrl, { headers });
    
    if (!reportsRes.ok) {
      const errorText = await reportsRes.text();
      console.error('Failed to fetch reports:', reportsRes.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch reports',
          downloads: [],
          dataDelayed: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reportsData = await reportsRes.json();
    console.log('Available reports:', JSON.stringify(reportsData.data?.map((r: any) => ({
      id: r.id,
      name: r.attributes?.name,
      category: r.attributes?.category
    })), null, 2));

    // Find a report that contains download/install data
    // Common names: "App Downloads", "App Units", "Installs", etc.
    const downloadReport = reportsData.data?.find((r: any) => {
      const name = (r.attributes?.name || '').toLowerCase();
      const category = (r.attributes?.category || '').toLowerCase();
      return name.includes('download') || 
             name.includes('unit') || 
             name.includes('install') ||
             category.includes('app_usage');
    });

    if (!downloadReport) {
      console.log('No download report found. Available reports:', 
        reportsData.data?.map((r: any) => r.attributes?.name));
      return new Response(
        JSON.stringify({ 
          downloads: [],
          dataDelayed: true,
          message: 'No download reports available yet. Apple data may take 24-48 hours.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found download report:', downloadReport.id, downloadReport.attributes?.name);

    // Step 3: Get report instances
    const instancesUrl = `https://api.appstoreconnect.apple.com/v1/analyticsReports/${downloadReport.id}/instances`;
    console.log('Fetching report instances...');
    
    const instancesRes = await fetch(instancesUrl, { headers });
    
    if (!instancesRes.ok) {
      const errorText = await instancesRes.text();
      console.error('Failed to fetch instances:', instancesRes.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch report instances',
          downloads: [],
          dataDelayed: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const instancesData = await instancesRes.json();
    console.log(`Found ${instancesData.data?.length || 0} report instances`);

    if (!instancesData.data || instancesData.data.length === 0) {
      return new Response(
        JSON.stringify({ 
          downloads: [],
          dataDelayed: true,
          message: 'No report instances available yet.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the most recent instance
    const latestInstance = instancesData.data[0];
    console.log('Latest instance:', latestInstance.id, latestInstance.attributes?.processingDate);

    // Step 4: Get segments for the instance
    const segmentsUrl = `https://api.appstoreconnect.apple.com/v1/analyticsReportInstances/${latestInstance.id}/segments`;
    console.log('Fetching segments...');
    
    const segmentsRes = await fetch(segmentsUrl, { headers });
    
    if (!segmentsRes.ok) {
      const errorText = await segmentsRes.text();
      console.error('Failed to fetch segments:', segmentsRes.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch report segments',
          downloads: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const segmentsData = await segmentsRes.json();
    console.log(`Found ${segmentsData.data?.length || 0} segments`);

    if (!segmentsData.data || segmentsData.data.length === 0) {
      return new Response(
        JSON.stringify({ 
          downloads: [],
          dataDelayed: true,
          message: 'No report segments available.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 5: Download and parse segment data
    const segment = segmentsData.data[0];
    const downloadUrl = segment.attributes?.url;
    
    if (!downloadUrl) {
      console.error('No download URL in segment');
      return new Response(
        JSON.stringify({ 
          error: 'No download URL available',
          downloads: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Downloading segment data...');
    const dataRes = await fetch(downloadUrl);
    
    if (!dataRes.ok) {
      console.error('Failed to download segment:', dataRes.status);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to download report data',
          downloads: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if it's gzipped
    const contentType = dataRes.headers.get('content-type') || '';
    const contentEncoding = dataRes.headers.get('content-encoding') || '';
    
    let textContent: string;
    
    if (contentEncoding.includes('gzip') || contentType.includes('gzip')) {
      console.log('Decompressing gzipped content...');
      const arrayBuffer = await dataRes.arrayBuffer();
      const decompressed = new Response(
        new ReadableStream({
          start(controller) {
            const stream = new DecompressionStream('gzip');
            const writer = stream.writable.getWriter();
            writer.write(new Uint8Array(arrayBuffer));
            writer.close();
            
            const reader = stream.readable.getReader();
            function read() {
              reader.read().then(({ done, value }) => {
                if (done) {
                  controller.close();
                  return;
                }
                controller.enqueue(value);
                read();
              });
            }
            read();
          }
        })
      );
      textContent = await decompressed.text();
    } else {
      textContent = await dataRes.text();
    }

    console.log('Report data preview:', textContent.substring(0, 500));

    // Parse the data
    const rows = parseTabularData(textContent);
    console.log(`Parsed ${rows.length} rows`);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ 
          downloads: [],
          message: 'Report file was empty'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log column names to help with field mapping
    console.log('Available columns:', Object.keys(rows[0]));

    // Aggregate downloads by date
    // Common column names: date, Date, processing_date, units, app_units, downloads
    const downloadsByDate: Record<string, number> = {};
    
    for (const row of rows) {
      const date = row.date || row.processing_date || row.report_date || '';
      const units = parseInt(row.units || row.app_units || row.downloads || row.total_downloads || '0', 10) || 0;
      
      if (date && date.match(/^\d{4}-\d{2}-\d{2}/)) {
        const dateKey = date.substring(0, 10);
        downloadsByDate[dateKey] = (downloadsByDate[dateKey] || 0) + units;
      }
    }

    const downloads = Object.entries(downloadsByDate)
      .map(([date, downloads]) => ({ date, downloads }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log(`Aggregated ${downloads.length} days of download data:`, downloads);

    return new Response(
      JSON.stringify({ downloads }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in asc-downloads function:', errorMessage);
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        downloads: []
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
