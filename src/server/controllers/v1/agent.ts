import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

interface StreamRequest {
  message: string;
  thread_id: string;
  session_id: string;
  user_id: string;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleStreamPost(fastify: FastifyInstance, request: FastifyRequest<{ Body: StreamRequest }>, reply: FastifyReply) {
  const { message, thread_id, user_id } = request.body;

  fastify.log.info(`Stream request - Thread: ${thread_id}, User: ${user_id}, Message: ${message.substring(0, 100)}...`);


  const initialTokens = `
{"type": "token", "content": "<div class=\\"p-4 bg-white/5 rounded-lg\\">"}
{"type": "token", "content": "<div class=\\"flex items-start\\">"}
{"type": "token", "content": "<div class=\\"ml-3\\">"}
{"type": "token", "content": "<p class=\\"text-gray-200\\">I need to analyze your request for total sales data.</p>"}
{"type": "token", "content": "<p class=\\"text-gray-300 mt-2\\">Let me break this down into several steps:</p>"}
{"type": "token", "content": "<ol class=\\"list-decimal list-inside mt-3 space-y-2 text-sm\\">"}
{"type": "token", "content": "<li class=\\"text-gray-200\\"><span class=\\"font-semibold\\">Find relevant data products</span> - I'll search for sales data sources</li>"}
{"type": "token", "content": "<li class=\\"text-gray-200\\"><span class=\\"font-semibold\\">Get guidance</span> - Understand data quality rules</li>"}
{"type": "token", "content": "<li class=\\"text-gray-200\\"><span class=\\"font-semibold\\">Get metadata</span> - Learn the data structure</li>"}
{"type": "token", "content": "<li class=\\"text-gray-200\\"><span class=\\"font-semibold\\">Generate SQL</span> - Create the right query</li>"}
{"type": "token", "content": "<li class=\\"text-gray-200\\"><span class=\\"font-semibold\\">Execute query</span> - Run it and get results</li>"}
{"type": "token", "content": "</ol>"}
{"type": "token", "content": "<p class=\\"text-gray-300 mt-4\\">Let me start by finding the right data sources...</p>"}
{"type": "token", "content": "</div>"}
{"type": "token", "content": "</div>"}
{"type": "token", "content": "</div>"}
`;

  const toolCall1 = `
{"type": "message", "content": {"type": "ai", "content": "", "tool_calls": [{"name": "identify_data_products", "args": {"query": "total sales for the last quarter"}, "id": "call_101"}], "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}

{"type": "message", "content": {"type": "tool", "content": [{"product_id": "DP_Sales_Q4", "name": "Quarterly Sales Data", "relevance_score": 0.98}], "tool_call_id": "call_101", "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}
`;

  const thinking1 = `
{"type": "token", "content": "<div class=\\"p-3 bg-white/5 rounded-lg mt-2\\">"}
{"type": "token", "content": "<div class=\\"flex items-center\\">"}
{"type": "token", "content": "<p class=\\"text-gray-200\\">Great! Found the relevant sales data product.</p>"}
{"type": "token", "content": "</div>"}
{"type": "token", "content": "<p class=\\"text-gray-300 text-sm mt-2\\">I found \\"Quarterly Sales Data\\" with 98% relevance. Now I need to get the guidance for this data product to understand any quality rules...</p>"}
{"type": "token", "content": "</div>"}
`;

  const toolCall2 = `
{"type": "message", "content": {"type": "ai", "content": "", "tool_calls": [{"name": "get_guidance", "args": {"data_products": [{"product_id": "DP_Sales_Q4"}]}, "id": "call_102"}], "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}

{"type": "message", "content": {"type": "tool", "content": {"guidance": "Only include transactions where status is 'COMPLETED'. The 'amount' column is in USD."}, "tool_call_id": "call_102", "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}
`;

  const thinking2 = `
{"type": "token", "content": "<div class=\\"p-3 bg-white/5 rounded-lg mt-2\\">"}
{"type": "token", "content": "<div class=\\"flex items-center\\">"}
{"type": "token", "content": "<p class=\\"text-gray-200\\">Got important data quality rules!</p>"}
{"type": "token", "content": "</div>"}
{"type": "token", "content": "<p class=\\"text-gray-300 text-sm mt-2\\">The guidance tells me to only include COMPLETED transactions and that amounts are in USD. Now let me get the metadata to understand the table structure...</p>"}
{"type": "token", "content": "</div>"}
`;

  const toolCall3 = `
{"type": "message", "content": {"type": "ai", "content": "", "tool_calls": [{"name": "get_metadata", "args": {"data_product_id": "DP_Sales_Q4"}, "id": "call_103"}], "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}

{"type": "message", "content": {"type": "tool", "content": {"schema": {"table_name": "quarterly_sales_2025", "columns": [{"name": "transaction_id", "type": "STRING"}, {"name": "transaction_date", "type": "TIMESTAMP"}, {"name": "amount", "type": "FLOAT"}, {"name": "status", "type": "STRING"}]}}, "tool_call_id": "call_103", "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}
`;

  const thinking3 = `
{"type": "token", "content": "<div class=\\"p-3 bg-white/5 rounded-lg mt-2\\">"}
{"type": "token", "content": "<div class=\\"flex items-center\\">"}
{"type": "token", "content": "<p class=\\"text-gray-200\\">Perfect! I have the table schema now.</p>"}
{"type": "token", "content": "</div>"}
{"type": "token", "content": "<p class=\\"text-gray-300 text-sm mt-2\\">The table is \\"quarterly_sales_2025\\" with columns for transaction_id, transaction_date, amount, and status. Now I can generate the proper SQL query...</p>"}
{"type": "token", "content": "</div>"}
`;

  const toolCall4 = `
{"type": "message", "content": {"type": "ai", "content": "", "tool_calls": [{"name": "generate_sql", "args": {"user_query": "total sales for the last quarter", "metadata": {"table_name": "quarterly_sales_2025", "columns": ["transaction_id", "transaction_date", "amount", "status"]}, "guidance": "Only include transactions where status is 'COMPLETED'."}, "id": "call_104"}], "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}

{"type": "message", "content": {"type": "tool", "content": {"sql_query": "SELECT SUM(amount) AS total_sales FROM quarterly_sales_2025 WHERE status = 'COMPLETED' AND transaction_date >= DATE('now', '-3 months');"}, "tool_call_id": "call_104", "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}
`;

  const thinking4 = `
{"type": "token", "content": "<div class=\\"p-3 bg-white/5 rounded-lg mt-2\\">"}
{"type": "token", "content": "<div class=\\"flex items-center\\">"}
{"type": "token", "content": "<p class=\\"text-gray-200\\">SQL query generated successfully!</p>"}
{"type": "token", "content": "</div>"}
{"type": "token", "content": "<p class=\\"text-gray-300 text-sm mt-2\\">The query will sum all amounts from completed transactions in the last 3 months. Time to execute it and get the final result...</p>"}
{"type": "token", "content": "</div>"}
`;

  const toolCall5 = `
{"type": "message", "content": {"type": "ai", "content": "", "tool_calls": [{"name": "execute_sql", "args": {"sql_query": "SELECT SUM(amount) AS total_sales FROM quarterly_sales_2025 WHERE status = 'COMPLETED' AND transaction_date >= DATE('now', '-3 months');"}, "id": "call_105"}], "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}

{"type": "message", "content": {"type": "tool", "content": [{"total_sales": 452109.75}], "tool_call_id": "call_105", "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}
`;

  const summaryTokens = `
{"type": "token", "content": "<div class=\\"p-4 bg-white/5 rounded-lg mt-4\\">"}
{"type": "token", "content": "<div class=\\"flex items-start\\">"}
{"type": "token", "content": "<div class=\\"ml-3\\">"}
{"type": "token", "content": "<h3 class=\\"text-gray-100 font-bold text-lg\\">Analysis Complete!</h3>"}
{"type": "token", "content": "<p class=\\"text-gray-200 mt-2\\">I've successfully gathered all the data you requested. Here's what I found:</p>"}
{"type": "token", "content": "<div class=\\"mt-4\\">"}
{"type": "token", "content": "<h4 class=\\"text-gray-100 font-semibold mb-3\\">Process Summary:</h4>"}
{"type": "token", "content": "<ul class=\\"space-y-2\\">"}
{"type": "token", "content": "<li class=\\"flex items-center text-gray-200 text-sm\\">"}
{"type": "token", "content": "<span class=\\"text-gray-400 mr-2\\">✓</span>"}
{"type": "token", "content": "<span>Found the relevant sales data product</span>"}
{"type": "token", "content": "</li>"}
{"type": "token", "content": "<li class=\\"flex items-center text-gray-200 text-sm\\">"}
{"type": "token", "content": "<span class=\\"text-gray-400 mr-2\\">✓</span>"}
{"type": "token", "content": "<span>Applied data quality rules (completed transactions only)</span>"}
{"type": "token", "content": "</li>"}
{"type": "token", "content": "<li class=\\"flex items-center text-gray-200 text-sm\\">"}
{"type": "token", "content": "<span class=\\"text-gray-400 mr-2\\">✓</span>"}
{"type": "token", "content": "<span>Retrieved the table schema and structure</span>"}
{"type": "token", "content": "</li>"}
{"type": "token", "content": "<li class=\\"flex items-center text-gray-200 text-sm\\">"}
{"type": "token", "content": "<span class=\\"text-gray-400 mr-2\\">✓</span>"}
{"type": "token", "content": "<span>Generated the appropriate SQL query</span>"}
{"type": "token", "content": "</li>"}
{"type": "token", "content": "<li class=\\"flex items-center text-gray-200 text-sm\\">"}
{"type": "token", "content": "<span class=\\"text-gray-400 mr-2\\">✓</span>"}
{"type": "token", "content": "<span>Executed the query successfully</span>"}
{"type": "token", "content": "</li>"}
{"type": "token", "content": "</ul>"}
{"type": "token", "content": "</div>"}
{"type": "token", "content": "<div class=\\"mt-4 p-3 bg-white/5 rounded-lg\\">"}
{"type": "token", "content": "<h4 class=\\"text-gray-100 font-semibold mb-2\\">Result:</h4>"}
{"type": "token", "content": "<p class=\\"text-gray-200\\">The total sales for the last quarter were</p>"}
{"type": "token", "content": "<p class=\\"text-2xl font-bold text-gray-100 mt-2\\">$452,109.75</p>"}
{"type": "token", "content": "<p class=\\"text-gray-400 text-sm mt-3\\">This calculation includes only completed transactions from the quarterly_sales_2025 table for the past 3 months.</p>"}
{"type": "token", "content": "</div>"}
{"type": "token", "content": "</div>"}
{"type": "token", "content": "</div>"}
{"type": "token", "content": "</div>"}

{"type": "message", "content": {"type": "ai", "content": "<div class=\\"p-4 bg-white/5 rounded-lg mt-4\\"><div class=\\"flex items-start\\"><div class=\\"ml-3\\"><h3 class=\\"text-gray-100 font-bold text-lg\\">Analysis Complete!</h3><p class=\\"text-gray-200 mt-2\\">I've successfully gathered all the data you requested. Here's what I found:</p><div class=\\"mt-4\\"><h4 class=\\"text-gray-100 font-semibold mb-3\\">Process Summary:</h4><ul class=\\"space-y-2\\"><li class=\\"flex items-center text-gray-200 text-sm\\"><span class=\\"text-gray-400 mr-2\\">✓</span><span>Found the relevant sales data product</span></li><li class=\\"flex items-center text-gray-200 text-sm\\"><span class=\\"text-gray-400 mr-2\\">✓</span><span>Applied data quality rules (completed transactions only)</span></li><li class=\\"flex items-center text-gray-200 text-sm\\"><span class=\\"text-gray-400 mr-2\\">✓</span><span>Retrieved the table schema and structure</span></li><li class=\\"flex items-center text-gray-200 text-sm\\"><span class=\\"text-gray-400 mr-2\\">✓</span><span>Generated the appropriate SQL query</span></li><li class=\\"flex items-center text-gray-200 text-sm\\"><span class=\\"text-gray-400 mr-2\\">✓</span><span>Executed the query successfully</span></li></ul></div><div class=\\"mt-4 p-3 bg-white/5 rounded-lg\\"><h4 class=\\"text-gray-100 font-semibold mb-2\\">Result:</h4><p class=\\"text-gray-200\\">The total sales for the last quarter were</p><p class=\\"text-2xl font-bold text-gray-100 mt-2\\">$452,109.75</p><p class=\\"text-gray-400 text-sm mt-3\\">This calculation includes only completed transactions from the quarterly_sales_2025 table for the past 3 months.</p></div></div></div></div>", "run_id": "run_abc", "thread_id": "thread_xyz", "session_id": "session_123"}}

[DONE]
    `

  reply.headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Origin, X-Requested-With, Cache-Control',
    'Access-Control-Allow-Credentials': 'true'
  });

  async function streamTokens(tokenString: string, delayMs: number = 200) {
    for (const chunk of tokenString.split('\n')) {
      if (chunk.trim()) {
        reply.raw.write(`${chunk}\n\n`);
        await delay(delayMs);
      }
    }
  }

  async function streamToolCall(toolCallString: string) {
    for (const chunk of toolCallString.split('\n')) {
      if (chunk.trim()) {
        reply.raw.write(`${chunk}\n\n`);
        if (chunk.includes('"tool_calls"')) {
          await delay(2000);
        } else {
          await delay(200);
        }
      }
    }
  }

  
  await streamTokens(initialTokens, 200);
  
  await streamToolCall(toolCall1);
  
  await streamTokens(thinking1, 200);
  
  await streamToolCall(toolCall2);
  
  await streamTokens(thinking2, 200);
  
  await streamToolCall(toolCall3);
  
  await streamTokens(thinking3, 200);
  
  await streamToolCall(toolCall4);
  
  await streamTokens(thinking4, 200);
  
  await streamToolCall(toolCall5);
  
  await streamTokens(summaryTokens, 200);


  reply.raw.end();
}

export async function handleHistoryGet(fastify: FastifyInstance, request: FastifyRequest<{ Params: { threadId: string } }>, reply: FastifyReply) {
  const { threadId } = request.params;
  
  fastify.log.info(`History request for thread: ${threadId}`);
  
  let history: any[] = [];

  if (threadId === 'aefb4483-3372-403a-86e7-db16d57a0cce') {
  history = [
    {
      "type": "human",
      "content": "What were our top performing products last quarter?",
      "id": `msg_${threadId}_1`
    },
    {
      "type": "ai",
      "content": "",
      "tool_calls": [
        {
          "name": "identify_data_products",
          "args": {
            "query": "top performing products last quarter"
          },
          "id": "call_001"
        }
      ],
      "id": `msg_${threadId}_2`
    },
    {
      "type": "tool",
      "content": [
        {
          "product_id": "DP_Product_Performance",
          "name": "Product Performance Analytics",
          "relevance_score": 0.95
        }
      ],
      "tool_call_id": "call_001",
      "id": `msg_${threadId}_3`
    },
    {
      "type": "ai",
      "content": "",
      "tool_calls": [
        {
          "name": "get_metadata",
          "args": {
            "data_product_id": "DP_Product_Performance"
          },
          "id": "call_002"
        }
      ],
      "id": `msg_${threadId}_4`
    },
    {
      "type": "tool",
      "content": {
        "schema": {
          "table_name": "product_sales_q3_2025",
          "columns": [
            {"name": "product_id", "type": "STRING"},
            {"name": "product_name", "type": "STRING"},
            {"name": "revenue", "type": "FLOAT"},
            {"name": "units_sold", "type": "INTEGER"},
            {"name": "quarter", "type": "STRING"}
          ]
        }
      },
      "tool_call_id": "call_002",
      "id": `msg_${threadId}_5`
    },
    {
      "type": "ai",
      "content": "",
      "tool_calls": [
        {
          "name": "generate_sql",
          "args": {
            "user_query": "top performing products last quarter",
            "metadata": {
              "table_name": "product_sales_q3_2025",
              "columns": ["product_id", "product_name", "revenue", "units_sold", "quarter"]
            }
          },
          "id": "call_003"
        }
      ],
      "id": `msg_${threadId}_6`
    },
    {
      "type": "tool",
      "content": {
        "sql_query": "SELECT product_name, SUM(revenue) as total_revenue, SUM(units_sold) as total_units FROM product_sales_q3_2025 WHERE quarter = 'Q3_2025' GROUP BY product_name ORDER BY total_revenue DESC LIMIT 10;"
      },
      "tool_call_id": "call_003",
      "id": `msg_${threadId}_7`
    },
    {
      "type": "ai",
      "content": "",
      "tool_calls": [
        {
          "name": "execute_sql",
          "args": {
            "sql_query": "SELECT product_name, SUM(revenue) as total_revenue, SUM(units_sold) as total_units FROM product_sales_q3_2025 WHERE quarter = 'Q3_2025' GROUP BY product_name ORDER BY total_revenue DESC LIMIT 10;"
          },
          "id": "call_004"
        }
      ],
      "id": `msg_${threadId}_8`
    },
    {
      "type": "tool",
      "content": [
        {"product_name": "Red Hat Enterprise Linux", "total_revenue": 15600000, "total_units": 12400},
        {"product_name": "OpenShift Container Platform", "total_revenue": 12800000, "total_units": 3200},
        {"product_name": "Ansible Automation Platform", "total_revenue": 8900000, "total_units": 5600},
        {"product_name": "Red Hat Satellite", "total_revenue": 6200000, "total_units": 2100},
        {"product_name": "JBoss Enterprise Application Platform", "total_revenue": 4500000, "total_units": 1800}
      ],
      "tool_call_id": "call_004",
      "id": `msg_${threadId}_9`
    },
    {
      "type": "ai",
      "content": "Based on the data analysis, here are your top performing products for Q3 2025:\n\n**Top 5 Products by Revenue:**\n\n1. **Red Hat Enterprise Linux** - $15.6M revenue (12,400 units)\n2. **OpenShift Container Platform** - $12.8M revenue (3,200 units)\n3. **Ansible Automation Platform** - $8.9M revenue (5,600 units)\n4. **Red Hat Satellite** - $6.2M revenue (2,100 units)\n5. **JBoss Enterprise Application Platform** - $4.5M revenue (1,800 units)\n\n**Key Insights:**\n- Red Hat Enterprise Linux continues to be the revenue leader with strong unit sales\n- OpenShift shows high revenue per unit, indicating strong enterprise adoption\n- Total revenue from top 5 products: $48M\n\nWould you like me to analyze any specific aspects of this performance data?",
      "id": `msg_${threadId}_10`
    },
    {
      "type": "human", 
      "content": "Show me the sales trend for OpenShift over the past 6 months",
      "id": `msg_${threadId}_11`
    },
    {
      "type": "ai",
      "content": "",
      "tool_calls": [
        {
          "name": "identify_data_products",
          "args": {
            "query": "OpenShift sales trend 6 months historical data"
          },
          "id": "call_005"
        }
      ],
      "id": `msg_${threadId}_12`
    },
    {
      "type": "tool",
      "content": [
        {
          "product_id": "DP_Monthly_Sales_Trends",
          "name": "Monthly Sales Trends",
          "relevance_score": 0.92
        }
      ],
      "tool_call_id": "call_005",
      "id": `msg_${threadId}_13`
    },
    {
      "type": "ai",
      "content": "",
      "tool_calls": [
        {
          "name": "generate_sql",
          "args": {
            "user_query": "OpenShift sales trend past 6 months",
            "metadata": {
              "table_name": "monthly_product_sales",
              "columns": ["product_name", "month_year", "revenue", "units_sold"]
            }
          },
          "id": "call_006"
        }
      ],
      "id": `msg_${threadId}_14`
    },
    {
      "type": "tool",
      "content": {
        "sql_query": "SELECT month_year, revenue, units_sold FROM monthly_product_sales WHERE product_name = 'OpenShift Container Platform' AND month_year >= DATE('now', '-6 months') ORDER BY month_year;"
      },
      "tool_call_id": "call_006",
      "id": `msg_${threadId}_15`
    },
    {
      "type": "ai",
      "content": "",
      "tool_calls": [
        {
          "name": "execute_sql",
          "args": {
            "sql_query": "SELECT month_year, revenue, units_sold FROM monthly_product_sales WHERE product_name = 'OpenShift Container Platform' AND month_year >= DATE('now', '-6 months') ORDER BY month_year;"
          },
          "id": "call_007"
        }
      ],
      "id": `msg_${threadId}_16`
    },
    {
      "type": "tool", 
      "content": [
        {"month_year": "2025-02", "revenue": 3200000, "units_sold": 800},
        {"month_year": "2025-03", "revenue": 3800000, "units_sold": 950},
        {"month_year": "2025-04", "revenue": 4100000, "units_sold": 1025},
        {"month_year": "2025-05", "revenue": 4500000, "units_sold": 1125},
        {"month_year": "2025-06", "revenue": 4200000, "units_sold": 1050},
        {"month_year": "2025-07", "revenue": 4800000, "units_sold": 1200}
      ],
      "tool_call_id": "call_007",
      "id": `msg_${threadId}_17`
    },
    {
      "type": "ai",
      "content": "Here's the OpenShift Container Platform sales trend over the past 6 months:\n\n**Monthly Performance:**\n- **Feb 2025**: $3.2M revenue, 800 units\n- **Mar 2025**: $3.8M revenue, 950 units (+18.8% MoM)\n- **Apr 2025**: $4.1M revenue, 1,025 units (+7.9% MoM)\n- **May 2025**: $4.5M revenue, 1,125 units (+9.8% MoM)\n- **Jun 2025**: $4.2M revenue, 1,050 units (-6.7% MoM)\n- **Jul 2025**: $4.8M revenue, 1,200 units (+14.3% MoM)\n\n**Key Trends:**\n- **Overall Growth**: 50% revenue increase from Feb to Jul\n- **Steady Unit Growth**: 50% increase in units sold\n- **Minor Dip**: June showed slight decline, but July recovered strongly\n- **Average Monthly Revenue**: $4.1M\n- **Consistent Price Point**: ~$4,000 per unit on average\n\nThe trend shows strong, consistent growth with OpenShift gaining significant market traction.",
      "id": `msg_${threadId}_18`
    }
  ];
  }
  else {
    history = [];
  }
  reply.send(history);
}