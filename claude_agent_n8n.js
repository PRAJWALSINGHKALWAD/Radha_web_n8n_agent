{
  "name": "RAG-Based Website Knowledge Agent with Vector Database",
  "nodes": [
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "id-1",
              "name": "startUrl",
              "value": "https://prajwalsinghkalwad.github.io/Pro-Coding-Studio-Documentation/docs/home",
              "type": "string"
            },
            {
              "id": "id-2",
              "name": "visitedUrls",
              "value": "[]",
              "type": "array"
            },
            {
              "id": "id-3",
              "name": "urlsToVisit",
              "value": "=[{{ $json.startUrl }}]",
              "type": "array"
            }
          ]
        },
        "options": {}
      },
      "id": "2eceef71-e1b4-4869-87e7-813f0e50c80f",
      "name": "Set Initial URL",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        256,
        624
      ]
    },
    {
      "parameters": {
        "url": "={{ $json.startUrl }}",
        "options": {}
      },
      "id": "0d416e2b-7b00-46d1-ae1f-2ef36b8a4226",
      "name": "Fetch Initial Page",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [
        480,
        624
      ]
    },
    {
      "parameters": {
        "operation": "extractHtmlContent",
        "extractionValues": {
          "values": [
            {
              "key": "links",
              "cssSelector": "a[href]",
              "returnValue": "attribute",
              "attribute": "href",
              "returnArray": true
            }
          ]
        },
        "options": {}
      },
      "id": "e770dc0c-4288-40ef-a4bc-6b1bd4145737",
      "name": "Extract Links",
      "type": "n8n-nodes-base.html",
      "typeVersion": 1.2,
      "position": [
        704,
        624
      ]
    },
    {
      "parameters": {
        "jsCode": "// Get input data from previous nodes\nconst startUrl = $('Set Initial URL').item.json.startUrl;\nconst extractedLinks = $json.links || [];\n\n// Parse URL helper\nconst parseUrl = (url) => {\n  if (!url || typeof url !== 'string') return null;\n  const match = url.match(/^(https?:\\/\\/)?([^\\/]+)(.*)?$/);\n  if (!match) return null;\n  return {\n    protocol: match[1] || 'https://',\n    hostname: match[2],\n    path: match[3] || ''\n  };\n};\n\nconst baseUrlParts = parseUrl(startUrl);\nif (!baseUrlParts) {\n  return [{ json: { url: startUrl } }];\n}\n\nconst baseDomain = baseUrlParts.hostname;\nconst baseUrl = `${baseUrlParts.protocol}${baseUrlParts.hostname}`;\n\n// Process and deduplicate links\nconst uniqueUrls = new Set();\n\n// Add the start URL first\nuniqueUrls.add(startUrl);\n\nfor (const link of extractedLinks) {\n  if (!link || typeof link !== 'string') continue;\n  \n  try {\n    let absoluteUrl;\n    \n    // Convert relative URLs to absolute\n    if (link.startsWith('http://') || link.startsWith('https://')) {\n      absoluteUrl = link;\n    } else if (link.startsWith('/')) {\n      absoluteUrl = baseUrl + link;\n    } else if (link.startsWith('#') || link.startsWith('?')) {\n      continue; // Skip anchor and query-only links\n    } else {\n      // Relative path\n      const startUrlBase = startUrl.substring(0, startUrl.lastIndexOf('/') + 1);\n      absoluteUrl = startUrlBase + link;\n    }\n    \n    // Check if same domain\n    const linkUrlParts = parseUrl(absoluteUrl);\n    if (!linkUrlParts || linkUrlParts.hostname !== baseDomain) continue;\n    \n    // Clean URL (remove hash and query, trailing slash)\n    let cleanUrl = absoluteUrl.split('#')[0].split('?')[0];\n    cleanUrl = cleanUrl.replace(/\\/$/, '');\n    \n    uniqueUrls.add(cleanUrl);\n  } catch (error) {\n    continue;\n  }\n}\n\n// Return each URL as a separate item\nreturn Array.from(uniqueUrls).map(url => ({\n  json: { url }\n}));"
      },
      "id": "196faed6-9af6-41ca-9d31-6eb9510ae85b",
      "name": "Filter & Dedupe Links",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        928,
        624
      ]
    },
    {
      "parameters": {
        "options": {}
      },
      "id": "56770ef8-90b5-4770-acd3-7c2db3db3d71",
      "name": "Loop Through URLs",
      "type": "n8n-nodes-base.splitInBatches",
      "typeVersion": 3,
      "position": [
        1152,
        624
      ]
    },
    {
      "parameters": {
        "url": "={{ $json.url }}",
        "options": {}
      },
      "id": "1bfbb7fb-09af-445d-ab8c-990d38d97bfa",
      "name": "Scrape Page",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.4,
      "position": [
        1376,
        624
      ]
    },
    {
      "parameters": {
        "operation": "extractHtmlContent",
        "extractionValues": {
          "values": [
            {
              "key": "text",
              "cssSelector": "body"
            }
          ]
        },
        "options": {
          "trimValues": true,
          "cleanUpText": true
        }
      },
      "id": "c0954404-ed70-4e3b-bf57-7421feb48e40",
      "name": "Convert to Text",
      "type": "n8n-nodes-base.html",
      "typeVersion": 1.2,
      "position": [
        1600,
        720
      ]
    },
    {
      "parameters": {
        "jsonMode": "expressionData",
        "jsonData": "={{ $json.text }}",
        "textSplittingMode": "custom",
        "options": {}
      },
      "id": "ebf65a2c-514f-4a5f-bde9-8a7ee4c76399",
      "name": "Prepare Documents",
      "type": "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
      "typeVersion": 1.1,
      "position": [
        2176,
        1024
      ]
    },
    {
      "parameters": {
        "chunkOverlap": 200,
        "options": {}
      },
      "id": "221901e2-8a9f-4b68-a6a9-2a31cbfced80",
      "name": "Split Text",
      "type": "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
      "typeVersion": 1,
      "position": [
        2256,
        1232
      ]
    },
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "website-query",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "71113932-6253-4fa2-8d0b-8adba54464d2",
      "name": "Receive Query",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2.1,
      "position": [
        0,
        0
      ],
      "webhookId": "5c6eaa96-c4d3-4c17-973b-a83ba423da1f",
      "alwaysOutputData": false
    },
    {
      "parameters": {
        "promptType": "define",
        "text": "={{ $json.body.query || $json.body.question || $json.body.message || $json.body }}\n",
        "options": {
          "systemMessage": "={{ ($json.userName ? \"The visitor you're speaking with is named \" + $json.userName + \". Greet them naturally if it fits.\\n\\n\" : \"\") + ($json.priorHistory ? \"Here is a summary of your previous conversations with this visitor:\\n\" + $json.priorHistory + \"\\n\\n\" : \"\") + \"When users ask questions:\\n1. Search the vector store using the user's question or relevant keywords from their question\\n2. Read the retrieved documentation carefully\\n3. Answer based ONLY on the information found in the vector store\\n4. If the vector store returns no relevant information, respond with \\\"I don't know\\\"\\n\\nExamples of good searches:\\n- User asks \\\"What does the website do?\\\" \\u2192 Search: \\\"Pro Coding Studio features purpose overview\\\"\\n- User asks \\\"How do I install it?\\\" \\u2192 Search: \\\"installation setup guide\\\"\\n- User asks \\\"What are the main features?\\\" \\u2192 Search: \\\"features capabilities\\\"\\n\\nAlways be helpful and provide complete answers based on the documentation.\\n\\n\\n\\n\\nRespond structure should in strictly markdown format.\" }}"
        }
      },
      "id": "6f367eda-379c-4f09-9849-433b56ff281c",
      "name": "RAG Agent",
      "type": "@n8n/n8n-nodes-langchain.agent",
      "typeVersion": 3.1,
      "position": [
        340,
        0
      ]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { answer: $json.output } }}",
        "options": {}
      },
      "id": "91cc4815-4f15-4236-a617-29d32874e204",
      "name": "Send Response",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.5,
      "position": [
        900,
        0
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "id-1",
              "name": "status",
              "value": "complete",
              "type": "string"
            },
            {
              "id": "id-2",
              "name": "message",
              "value": "Website scraping and indexing finished",
              "type": "string"
            },
            {
              "id": "id-3",
              "name": "totalUrlsProcessed",
              "value": "={{ $('Loop Through URLs').item.json.urlsToVisit.length }}",
              "type": "number"
            }
          ]
        },
        "options": {}
      },
      "id": "cc32f18b-251a-425c-b270-632d811f8730",
      "name": "Scraping Complete",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        1376,
        432
      ]
    },
    {
      "parameters": {
        "operation": "extractHtmlContent",
        "extractionValues": {
          "values": [
            {
              "key": "links",
              "cssSelector": "a[href]",
              "returnValue": "attribute",
              "attribute": "href",
              "returnArray": true
            }
          ]
        },
        "options": {
          "trimValues": true,
          "cleanUpText": true
        }
      },
      "id": "7d68774c-60eb-4cff-9015-f6a0f0ffb7ff",
      "name": "Extract Links from Page",
      "type": "n8n-nodes-base.html",
      "typeVersion": 1.2,
      "position": [
        1600,
        528
      ]
    },
    {
      "parameters": {
        "jsCode": "// Get text from the Convert to Text node output\nconst textContent = $('Convert to Text').item.json.text;\nconst currentUrl = $('Scrape Page').item.json.url || $input.first().json.url;\n\nreturn [{\n  json: {\n    text: textContent,\n    url: currentUrl,\n    pageContent: textContent\n  }\n}];"
      },
      "id": "7b61eca1-8d37-4570-9ae8-0395afb23dbe",
      "name": "Update URL Queue",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        1824,
        720
      ]
    },
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "triggerAtHour": 22,
              "triggerAtMinute": 46
            }
          ]
        }
      },
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.3,
      "position": [
        32,
        624
      ],
      "id": "673545a7-3202-446d-bf5e-77953c124667",
      "name": "Schedule Trigger"
    },
    {
      "parameters": {
        "mode": "retrieve-as-tool",
        "toolDescription": "Search the Pro Coding Studio documentation. Contains guides, features, tutorials, and reference information about the platform. Use this to find answers to user questions about Pro Coding Studio.",
        "memoryKey": {
          "__rl": true,
          "mode": "id",
          "value": "vector_store_key"
        }
      },
      "type": "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
      "typeVersion": 1.3,
      "position": [
        512,
        224
      ],
      "id": "07adc212-806f-4e51-bc06-51eebf622de5",
      "name": "Simple Vector Store"
    },
    {
      "parameters": {
        "mode": "insert",
        "memoryKey": {
          "__rl": true,
          "mode": "id",
          "value": "vector_store_key"
        }
      },
      "type": "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
      "typeVersion": 1.3,
      "position": [
        2080,
        800
      ],
      "id": "2787f062-e291-4b9b-828d-e3fb50cfb770",
      "name": "Simple Vector Store1"
    },
    {
      "parameters": {
        "sessionIdType": "customKey",
        "sessionKey": "={{ $json.userName || $json.sessionId || $json.body.sessionId }}",
        "contextWindowLength": 10
      },
      "id": "cde0ab2e-8062-4a3b-8206-b9a1e4505e5c",
      "name": "Conversation Memory",
      "type": "@n8n/n8n-nodes-langchain.memoryBufferWindow",
      "typeVersion": 1.3,
      "position": [
        384,
        224
      ]
    },
    {
      "parameters": {},
      "type": "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini",
      "typeVersion": 1,
      "position": [
        2064,
        1040
      ],
      "id": "df33cfd5-4b2a-40b6-916c-a5dbee524d72",
      "name": "Embeddings Google Gemini",
      "credentials": {
        "googlePalmApi": {
          "id": "ZSJRzPYI2sEmYS0E",
          "name": "Google Gemini(PaLM) Api account"
        }
      }
    },
    {
      "parameters": {
        "options": {}
      },
      "type": "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
      "typeVersion": 1.1,
      "position": [
        192,
        208
      ],
      "id": "18d9b662-ce56-447d-b680-98b2d459685c",
      "name": "Google Gemini Chat Model",
      "credentials": {
        "googlePalmApi": {
          "id": "ZSJRzPYI2sEmYS0E",
          "name": "Google Gemini(PaLM) Api account"
        }
      }
    },
    {
      "parameters": {},
      "type": "@n8n/n8n-nodes-langchain.embeddingsGoogleGemini",
      "typeVersion": 1,
      "position": [
        608,
        432
      ],
      "id": "1c40d4cb-8027-4ea4-9a2d-c56372799411",
      "name": "Embeddings Google Gemini1",
      "credentials": {
        "googlePalmApi": {
          "id": "ZSJRzPYI2sEmYS0E",
          "name": "Google Gemini(PaLM) Api account"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "// Auth Check \u2014 no external database. Authorized visitors send an\n// x-user-token header (set by the CLIENT WEBSITE'S OWN login system,\n// forwarded by our widget). Guests send no such header. Both are\n// always allowed through \u2014 this only decides what context the agent\n// gets, it never blocks a request.\n//\n// Authenticated users additionally get their prior-visit history\n// loaded here (stored in n8n's workflow static data, keyed by name \u2014\n// no external DB). Guests get nothing loaded; their memory only ever\n// lives in the short-lived, per-session Conversation Memory buffer.\n\nconst AUTH_USERS = {\n  \"tok_demo_123\": { name: \"Priya\" }\n};\n\nconst headers = $input.first().json.headers || {};\nconst token = headers['x-user-token'];\n\nlet tier = 'guest';\nlet userName = null;\nlet priorHistory = '';\n\nif (token && AUTH_USERS[token]) {\n  tier = 'authenticated';\n  userName = AUTH_USERS[token].name;\n\n  const staticData = $getWorkflowStaticData('global');\n  if (!staticData.userHistories) staticData.userHistories = {};\n  const history = staticData.userHistories[userName] || [];\n\n  if (history.length) {\n    priorHistory = history\n      .map(h => `User: ${h.q}\\nAssistant: ${h.a}`)\n      .join('\\n');\n  }\n}\n\nreturn [{\n  json: {\n    ...$input.first().json,\n    tier,\n    userName,\n    priorHistory\n  }\n}];\n"
      },
      "id": "d4d4d4d4-auth-check-000000000001",
      "name": "Auth Check",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        140,
        0
      ]
    },
    {
      "parameters": {
        "jsCode": "// Visitor Log \u2014 no external database. Uses n8n's built-in workflow\n// static data as the only storage. Good enough for a demo/prototype;\n// NOT a substitute for real analytics (it resets if the workflow is\n// duplicated/re-imported, and isn't easily queryable outside n8n).\n//\n// Also saves each authenticated user's exchange into a rolling\n// per-user history (last 10 exchanges) so it's there next time they\n// visit. Guests are never saved here \u2014 their memory stays session-only.\n\nconst staticData = $getWorkflowStaticData('global');\nif (!staticData.totalVisits) staticData.totalVisits = 0;\nif (!staticData.authenticatedVisitors) staticData.authenticatedVisitors = [];\nif (!staticData.userHistories) staticData.userHistories = {};\n\nstaticData.totalVisits += 1;\n\nconst tier = $json.tier;\nconst userName = $json.userName;\n\nif (tier === 'authenticated' && userName) {\n  if (!staticData.authenticatedVisitors.includes(userName)) {\n    staticData.authenticatedVisitors.push(userName);\n  }\n\n  const userMessage = ($json.body && ($json.body.message || $json.body.query || $json.body.question)) || '';\n  // n8n's LangChain Agent node typically outputs the reply on `output`.\n  // Fallback to `text` in case your n8n version names it differently.\n  const assistantMessage = $json.output || $json.text || '';\n\n  if (!staticData.userHistories[userName]) staticData.userHistories[userName] = [];\n  staticData.userHistories[userName].push({ q: userMessage, a: assistantMessage });\n\n  // Keep only the last 10 exchanges per user \u2014 bounded growth.\n  if (staticData.userHistories[userName].length > 10) {\n    staticData.userHistories[userName] = staticData.userHistories[userName].slice(-10);\n  }\n}\n\n// Pass the agent's output through unchanged so Send Response still works,\n// just with the running counters attached for your own visibility.\nreturn [{\n  json: {\n    ...$json,\n    totalVisits: staticData.totalVisits,\n    authenticatedVisitors: staticData.authenticatedVisitors\n  }\n}];\n"
      },
      "id": "e5e5e5e5-visitor-log-000000000002",
      "name": "Visitor Log",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        660,
        0
      ]
    }
  ],
  "pinData": {},
  "connections": {
    "Set Initial URL": {
      "main": [
        [
          {
            "node": "Fetch Initial Page",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Fetch Initial Page": {
      "main": [
        [
          {
            "node": "Extract Links",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Extract Links": {
      "main": [
        [
          {
            "node": "Filter & Dedupe Links",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Filter & Dedupe Links": {
      "main": [
        [
          {
            "node": "Loop Through URLs",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Loop Through URLs": {
      "main": [
        [
          {
            "node": "Scraping Complete",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Scrape Page",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Scrape Page": {
      "main": [
        [
          {
            "node": "Extract Links from Page",
            "type": "main",
            "index": 0
          },
          {
            "node": "Convert to Text",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Convert to Text": {
      "main": [
        [
          {
            "node": "Update URL Queue",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Prepare Documents": {
      "ai_document": [
        [
          {
            "node": "Simple Vector Store1",
            "type": "ai_document",
            "index": 0
          }
        ]
      ]
    },
    "Split Text": {
      "ai_textSplitter": [
        [
          {
            "node": "Prepare Documents",
            "type": "ai_textSplitter",
            "index": 0
          }
        ]
      ]
    },
    "Receive Query": {
      "main": [
        [
          {
            "node": "Auth Check",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "RAG Agent": {
      "main": [
        [
          {
            "node": "Visitor Log",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Update URL Queue": {
      "main": [
        [
          {
            "node": "Simple Vector Store1",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Schedule Trigger": {
      "main": [
        [
          {
            "node": "Set Initial URL",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Simple Vector Store": {
      "ai_tool": [
        [
          {
            "node": "RAG Agent",
            "type": "ai_tool",
            "index": 0
          }
        ]
      ]
    },
    "Simple Vector Store1": {
      "main": [
        [
          {
            "node": "Loop Through URLs",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Conversation Memory": {
      "ai_memory": [
        [
          {
            "node": "RAG Agent",
            "type": "ai_memory",
            "index": 0
          }
        ]
      ]
    },
    "Embeddings Google Gemini": {
      "ai_embedding": [
        [
          {
            "node": "Simple Vector Store1",
            "type": "ai_embedding",
            "index": 0
          }
        ]
      ]
    },
    "Google Gemini Chat Model": {
      "ai_languageModel": [
        [
          {
            "node": "RAG Agent",
            "type": "ai_languageModel",
            "index": 0
          }
        ]
      ]
    },
    "Embeddings Google Gemini1": {
      "ai_embedding": [
        [
          {
            "node": "Simple Vector Store",
            "type": "ai_embedding",
            "index": 0
          }
        ]
      ]
    },
    "Auth Check": {
      "main": [
        [
          {
            "node": "RAG Agent",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Visitor Log": {
      "main": [
        [
          {
            "node": "Send Response",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  },
  "active": false,
  "settings": {
    "executionOrder": "v1",
    "binaryMode": "separate"
  },
  "versionId": "37add23b-354f-417e-9031-d168db50be8f",
  "meta": {
    "templateCredsSetupCompleted": true,
    "instanceId": "5d23e0a9ced117faadda677a76d903dae1cfee9f6fcf50cedcb974053a65ff7b"
  },
  "nodeGroups": [],
  "id": "k2Xfna8Np6D6Yu4X",
  "tags": []
}