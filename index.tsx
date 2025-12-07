import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Wallet, 
  CreditCard, 
  ArrowRightLeft, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  PieChart,
  Smartphone,
  Lock,
  Cpu,
  Trash2,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

// --- Types & Interfaces ---

declare global {
  interface Window {
    // Chrome Built-in AI (Gemini Nano)
    ai?: {
      languageModel: {
        capabilities: () => Promise<{ available: 'readily' | 'after-download' | 'no' }>;
        create: (options?: { systemPrompt?: string }) => Promise<{
          prompt: (input: string) => Promise<string>;
          destroy: () => void;
        }>;
      };
    };
    // Hybrid App Bridge (Hypothetical)
    Android?: {
      requestSMSPermission: () => boolean;
      readAllSMS: () => string; // Returns JSON string or raw text
    };
  }
}

type TransactionStatus = 'success' | 'failed' | 'cancelled' | 'pending';
type TransactionType = 'debit' | 'credit';

interface Transaction {
  id: string;
  originalText: string;
  date: string;
  amount: number;
  merchant: string;
  category: string;
  bankName: string;
  paymentMode: string;
  type: TransactionType;
  status: TransactionStatus;
}

interface AnalysisSummary {
  totalSpent: number;
  totalIncome: number;
  transactionCount: number;
  failedCount: number;
  categoryBreakdown: Record<string, number>;
}

// --- Constants & Regex Helpers (Reference: transaction-sms-parser) ---

const KEYWORDS = ['debited', 'credited', 'upi', 'imps', 'neft', 'spent', 'paid', 'sent', 'received', 'txn', 'refund', 'ac', 'a/c'];

// Regex patterns for heuristic fallback or pre-filtering
const PATTERNS = {
  amount: /(?:rs\.?|inr)\s*([\d,]+(?:\.\d{2})?)/i,
  merchant: /(?:at|to|from)\s+([a-zA-Z0-9\s&]+?)(?=\s*(?:on|via|using|through|ref|bal|is|ending|\.))/i,
  date: /(\d{2}[-./]\d{2}[-./]\d{2,4})/
};

// --- Sample Data for Demo ---

const SAMPLE_SMS = `
Rs. 540.00 debited from HDFC Bank A/c XX8921 via UPI to Zomato Pvt Ltd on 12-05-24. UPI Ref: 413234567890.
Credited Rs. 12,000.00 to SBI A/c XX1234 on 10-05-24 via IMPS from Tech Solutions Inc.
Txn of INR 2,499.00 on your ICICI Credit Card XX4001 at Amazon Retail failed due to incorrect OTP.
Paid Rs 150 to Uber via Paytm Wallet. Balance is Rs 450.
Rs. 540.00 debited from HDFC Bank A/c XX8921 via UPI to Zomato Pvt Ltd on 12-05-24. UPI Ref: 413234567890.
Refund of Rs. 450.00 received from Uber India for cancelled ride.
Rs 45.00 spent on Chai Point.
`;

// --- Components ---

const StatusBadge = ({ status }: { status: TransactionStatus }) => {
  const styles = {
    success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
    cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
      {status === 'success' && <CheckCircle2 className="w-3 h-3 mr-1" />}
      {status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
      {status === 'cancelled' && <ArrowRightLeft className="w-3 h-3 mr-1" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

const App = () => {
  const [inputText, setInputText] = useState<string>('');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [modelAvailable, setModelAvailable] = useState<boolean | null>(null);

  // Summary State
  const [summary, setSummary] = useState<AnalysisSummary>({
    totalSpent: 0,
    totalIncome: 0,
    transactionCount: 0,
    failedCount: 0,
    categoryBreakdown: {},
  });

  // Check for Embedded Model Availability
  useEffect(() => {
    const checkModel = async () => {
      if (window.ai && window.ai.languageModel) {
        try {
          const cap = await window.ai.languageModel.capabilities();
          setModelAvailable(cap.available !== 'no');
        } catch (e) {
          console.error("Error checking AI capabilities", e);
          setModelAvailable(false);
        }
      } else {
        setModelAvailable(false);
      }
    };
    checkModel();
  }, []);

  const requestPermission = async () => {
    // Simulate Android Permission Request
    setLoading(true);
    setProcessingStatus('Requesting SMS READ permission...');
    
    await new Promise(r => setTimeout(r, 800));

    // In a real Hybrid app, this would be:
    // const granted = window.Android?.requestSMSPermission();
    const granted = window.confirm("Allow Rupiya to access and read SMS messages on this device?\n\nData will be processed locally.");
    
    setPermissionGranted(granted);
    setLoading(false);
    setProcessingStatus('');

    if (granted) {
      readSMSFromDevice();
    }
  };

  const readSMSFromDevice = async () => {
    setLoading(true);
    setProcessingStatus('Reading SMS inbox...');
    
    try {
      let smsData = "";
      if (window.Android && window.Android.readAllSMS) {
        smsData = window.Android.readAllSMS();
      } else {
        // Fallback for Web Demo
        await new Promise(r => setTimeout(r, 1000));
        smsData = SAMPLE_SMS; 
        console.log("Using sample data (Simulated Device)");
      }
      setInputText(smsData);
      // Auto-analyze after fetch
      analyzeSMS(smsData);
    } catch (e) {
      console.error(e);
      setProcessingStatus("Failed to read SMS");
    } finally {
      setLoading(false);
    }
  };

  const parseWithRegexFallback = (text: string): Partial<Transaction> => {
    // Heuristic parsing based on 'transaction-sms-parser' logic
    const amountMatch = text.match(PATTERNS.amount);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;
    
    const merchantMatch = text.match(PATTERNS.merchant);
    const merchant = merchantMatch ? merchantMatch[1].trim() : "Unknown";

    const isCredit = /credited|received/i.test(text);
    const isFailed = /failed|declined/i.test(text);
    const isCancelled = /refund|reversed/i.test(text) && !isCredit; // Context dependent

    return {
      amount,
      merchant,
      type: isCredit ? 'credit' : 'debit',
      status: isFailed ? 'failed' : isCancelled ? 'cancelled' : 'success'
    };
  };

  const analyzeSMS = async (textToAnalyze: string) => {
    if (!textToAnalyze.trim()) return;

    setLoading(true);
    setProcessingStatus(modelAvailable ? 'Initializing Embedded Gemini Nano...' : 'Using fallback parser...');
    
    // 1. Pre-filtering (Optimization for Local Models)
    // Split by lines and only keep those with financial keywords
    const lines = textToAnalyze.split('\n').filter(line => {
      const lower = line.toLowerCase();
      return KEYWORDS.some(k => lower.includes(k));
    });

    const parsedTransactions: Transaction[] = [];

    // 2. Process each line
    try {
      let session;
      if (modelAvailable && window.ai) {
         session = await window.ai.languageModel.create({
          systemPrompt: "You are a parser for Indian banking SMS. Extract JSON with keys: amount (number), merchant (string), category (Food/Travel/Bills/Shopping), status (success/failed), type (credit/debit)."
        });
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length < 10) continue;

        setProcessingStatus(`Analyzing transaction ${i + 1}/${lines.length}...`);

        let txn: Partial<Transaction> = {};

        if (session) {
          // Local AI Attempt
          try {
            const prompt = `Parse this SMS: "${line}". Return ONLY a JSON object.`;
            const result = await session.prompt(prompt);
            // Attempt to find JSON in response (Local models can be chatty)
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              txn = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error("No JSON found");
            }
          } catch (e) {
            // AI Failed, fallback to regex
            txn = parseWithRegexFallback(line);
          }
        } else {
          // No AI available
          txn = parseWithRegexFallback(line);
          // Simple category heuristic for regex mode
          if (/zomato|swiggy|food/i.test(txn.merchant || '')) txn.category = 'Food';
          else if (/uber|ola|fuel|petrol/i.test(txn.merchant || '')) txn.category = 'Travel';
          else txn.category = 'General';
        }

        // Validate and push
        if (txn.amount && txn.amount > 0) {
          // Check for duplicates in current batch
          const isDuplicate = parsedTransactions.some(t => 
            t.amount === txn.amount && 
            t.merchant === txn.merchant && 
            t.originalText === line
          );

          if (!isDuplicate) {
             parsedTransactions.push({
              id: `txn-${Date.now()}-${i}`,
              originalText: line,
              date: new Date().toISOString().split('T')[0], // Default date
              amount: txn.amount || 0,
              merchant: txn.merchant || 'Unknown',
              category: txn.category || 'Other',
              bankName: 'Bank', // Simplified for local demo
              paymentMode: 'UPI', // Simplified
              type: (txn.type as TransactionType) || 'debit',
              status: (txn.status as TransactionStatus) || 'success',
            });
          }
        }
      }

      if (session) session.destroy();

      setTransactions(parsedTransactions);
      calculateSummary(parsedTransactions);

    } catch (err) {
      console.error(err);
      setProcessingStatus('Error processing data.');
    } finally {
      setLoading(false);
      setProcessingStatus('');
    }
  };

  const calculateSummary = (txns: Transaction[]) => {
    const stats: AnalysisSummary = {
      totalSpent: 0,
      totalIncome: 0,
      transactionCount: txns.length,
      failedCount: 0,
      categoryBreakdown: {},
    };

    txns.forEach(t => {
      if (t.status === 'success') {
        if (t.type === 'debit') {
          stats.totalSpent += t.amount;
          stats.categoryBreakdown[t.category] = (stats.categoryBreakdown[t.category] || 0) + t.amount;
        } else {
          stats.totalIncome += t.amount;
        }
      } else {
        stats.failedCount++;
      }
    });

    setSummary(stats);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 pb-12 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-600 p-2 rounded-lg">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Rupiya <span className="text-emerald-600 font-normal text-sm ml-1">On-Device</span></h1>
          </div>
          <div className="flex items-center gap-3">
             <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Privacy Mode: Active</span>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Connection/Permission Banner */}
        {!permissionGranted && (
          <div className="mb-8 bg-slate-900 rounded-xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-slate-800 rounded-lg">
                <Smartphone className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold mb-1">Connect to Android SMS</h2>
                <p className="text-slate-300 text-sm max-w-xl">
                  Rupiya needs permission to read your transaction messages. All data is processed locally on your device using embedded AI. No data is ever sent to the cloud.
                </p>
              </div>
            </div>
            <button 
              onClick={requestPermission}
              disabled={loading}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Grant Permission
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Data Source */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Status Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">System Status</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium">Embedded AI</span>
                  </div>
                  {modelAvailable === true ? (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">READY</span>
                  ) : modelAvailable === false ? (
                    <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">UNAVAILABLE</span>
                  ) : (
                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded">CHECKING...</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium">Device Access</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${permissionGranted ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                    {permissionGranted ? 'GRANTED' : 'DENIED'}
                  </span>
                </div>
              </div>

              {!modelAvailable && modelAvailable !== null && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-100 rounded-md flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Chrome Built-in AI (Gemini Nano) not detected. Using regex fallback engine.
                  </p>
                </div>
              )}
            </div>

            {/* Manual Input / Debug */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 opacity-75 hover:opacity-100 transition-opacity">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-500">Raw Data (Debug)</h3>
                <button 
                  onClick={() => analyzeSMS(inputText)} 
                  disabled={loading}
                  className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Reprocess
                </button>
              </div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="w-full h-32 p-3 rounded-lg border border-gray-200 text-xs font-mono text-gray-600 resize-none focus:ring-1 focus:ring-emerald-500 outline-none"
                placeholder="SMS data will appear here..."
              ></textarea>
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Loading State Overlay */}
            {loading && (
               <div className="bg-white p-8 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center text-center animate-pulse">
                 <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
                 <h3 className="text-lg font-semibold text-slate-900">Processing Locally</h3>
                 <p className="text-sm text-gray-500 mt-1">{processingStatus}</p>
               </div>
            )}

            {/* Dashboard Cards (Only show if not loading) */}
            {!loading && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-500">Total Spent</span>
                      <div className="p-1.5 bg-red-50 rounded-md">
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                      {formatCurrency(summary.totalSpent)}
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-500">Total Income</span>
                      <div className="p-1.5 bg-emerald-50 rounded-md">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                      {formatCurrency(summary.totalIncome)}
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-500">Transactions</span>
                      <div className="p-1.5 bg-blue-50 rounded-md">
                        <CreditCard className="w-4 h-4 text-blue-600" />
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-900">{summary.transactionCount}</span>
                      {summary.failedCount > 0 && (
                        <span className="text-xs font-medium text-red-500">({summary.failedCount} failed)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Main Transaction Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
                  <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900">Recent Transactions</h3>
                    {transactions.length > 0 && (
                       <button onClick={() => {
                         setTransactions([]);
                         setInputText('');
                         setSummary({ totalSpent: 0, totalIncome: 0, transactionCount: 0, failedCount: 0, categoryBreakdown: {} });
                       }} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                       </button>
                    )}
                  </div>

                  {transactions.length === 0 ? (
                    <div className="h-80 flex flex-col items-center justify-center text-center px-4">
                      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 text-gray-300" />
                      </div>
                      <h4 className="text-slate-900 font-medium mb-1">No data to display</h4>
                      <p className="text-gray-500 text-sm max-w-sm">
                        Connect to your device to scan for SMS transactions.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                            <th className="px-6 py-4">Details</th>
                            <th className="px-6 py-4 text-right">Amount</th>
                            <th className="px-6 py-4 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {transactions.map((txn) => (
                            <tr key={txn.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="flex flex-col">
                                  <span className="text-sm font-semibold text-slate-900">{txn.merchant}</span>
                                  <span className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                                    <span className="bg-gray-100 px-1.5 rounded">{txn.category}</span>
                                    <span>• {txn.date}</span>
                                  </span>
                                  <p className="text-[10px] text-gray-400 mt-1 truncate max-w-xs">{txn.originalText}</p>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right whitespace-nowrap">
                                <div className={`text-sm font-bold ${
                                  txn.status !== 'success' ? 'text-gray-400 line-through' :
                                  txn.type === 'debit' ? 'text-slate-900' : 'text-emerald-600'
                                }`}>
                                  {txn.type === 'debit' ? '-' : '+'}{formatCurrency(txn.amount)}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center whitespace-nowrap">
                                <StatusBadge status={txn.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
