import React, { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { useNavigate } from 'react-router-dom';
import { ZoomIn, RotateCcw, AlertTriangle, ArrowRight, ShieldAlert, CheckCircle2, AlertCircle, Play, Pause } from 'lucide-react';

export default function NetworkGraphView({ scans }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const navigate = useNavigate();
  const [selectedNode, setSelectedNode] = useState(null);
  const [physicsEnabled, setPhysicsEnabled] = useState(true);

  // Parse contact method to extract clean identifier and type
  const parseContacts = (contactStr) => {
    if (!contactStr) return [];
    const str = contactStr.trim();
    const contacts = [];

    // Telegram username / links
    const tgUserMatch = str.match(/(?:t\.me\/|tg:\/\/resolve\?domain=)([a-zA-Z0-9_]{5,32})/i);
    const tgInviteMatch = str.match(/(?:t\.me\/\+|tg:\/\/join\?invite=)([a-zA-Z0-9_-]+)/i);
    const tgRawUser = str.match(/@([a-zA-Z0-9_]{5,32})/);
    const isTelegramText = str.toLowerCase().includes('telegram');

    if (tgUserMatch) {
      contacts.push({ id: `tg_${tgUserMatch[1].toLowerCase()}`, label: `✈️ @${tgUserMatch[1]}`, type: 'Telegram', value: tgUserMatch[1] });
    } else if (tgInviteMatch) {
      contacts.push({ id: `tg_invite_${tgInviteMatch[1]}`, label: `✈️ Telegram Invite`, type: 'Telegram', value: inviteLinkUrl(tgInviteMatch[1]) });
    } else if (tgRawUser) {
      contacts.push({ id: `tg_${tgRawUser[1].toLowerCase()}`, label: `✈️ @${tgRawUser[1]}`, type: 'Telegram', value: tgRawUser[1] });
    }

    // WhatsApp links/numbers
    const waMatch = str.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)([0-9]+)/i);
    const isWhatsAppText = str.toLowerCase().includes('whatsapp');
    
    if (waMatch) {
      contacts.push({ id: `wa_${waMatch[1]}`, label: `💬 WhatsApp (+${waMatch[1]})`, type: 'WhatsApp', value: waMatch[1] });
    } else if (isWhatsAppText) {
      const numMatch = str.match(/\+?[0-9]{8,15}/);
      if (numMatch) {
        const cleanNum = numMatch[0].replace(/[^0-9]/g, '');
        contacts.push({ id: `wa_${cleanNum}`, label: `💬 WhatsApp (+${cleanNum})`, type: 'WhatsApp', value: cleanNum });
      }
    }

    // Emails
    const emailMatch = str.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
    if (emailMatch) {
      contacts.push({ id: `email_${emailMatch[1].toLowerCase()}`, label: `✉️ ${emailMatch[1]}`, type: 'Email', value: emailMatch[1] });
    }

    // Fallback if none matched but there is content
    if (contacts.length === 0 && str.length > 0) {
      const truncated = str.length > 25 ? str.substring(0, 22) + '...' : str;
      contacts.push({ id: `generic_${encodeURIComponent(str)}`, label: `📞 ${truncated}`, type: 'Contact', value: str });
    }

    return contacts;
  };

  const inviteLinkUrl = (code) => `https://t.me/+${code}`;

  useEffect(() => {
    if (!containerRef.current || !scans) return;

    const nodesMap = new Map();
    const edgesList = [];

    scans.forEach((scan) => {
      // 1. Scan Node
      const scanId = `scan_${scan.id}`;
      let color = '#10b981'; // low risk
      let fontColor = '#ffffff';
      if (scan.riskScore >= 60) {
        color = '#ef4444'; // high risk
      } else if (scan.riskScore >= 30) {
        color = '#f59e0b'; // medium risk
      }

      nodesMap.set(scanId, {
        id: scanId,
        label: scan.jobTitle || 'Unknown Role',
        title: `Job: ${scan.jobTitle || 'Unknown'}\nRisk Score: ${scan.riskScore}%\nEmployer: ${scan.employer || 'Unknown'}`,
        shape: 'dot',
        size: 15,
        color: {
          background: color,
          border: '#ffffff',
          highlight: {
            background: color,
            border: '#1e293b'
          }
        },
        font: { color: fontColor, size: 12 },
        type: 'scan',
        data: scan
      });

      // 2. Employer Node
      if (scan.employer && scan.employer.trim()) {
        const empClean = scan.employer.trim();
        const empId = `emp_${empClean.toLowerCase()}`;

        if (!nodesMap.has(empId)) {
          nodesMap.set(empId, {
            id: empId,
            label: `🏢 ${empClean}`,
            shape: 'box',
            color: {
              background: '#e2e8f0',
              border: '#94a3b8',
              highlight: {
                background: '#cbd5e1',
                border: '#475569'
              }
            },
            font: { color: '#1e293b', size: 13, bold: true },
            margin: 10,
            type: 'employer',
            name: empClean,
            connectedScansCount: 0
          });
        }
        // Increment scan count for this employer
        nodesMap.get(empId).connectedScansCount += 1;

        // Add edge
        edgesList.push({
          from: scanId,
          to: empId,
          color: { color: '#94a3b8', opacity: 0.6 },
          width: 1
        });
      }

      // 3. Contact Nodes
      const contacts = parseContacts(scan.extractedData?.contact_method);
      contacts.forEach((contact) => {
        if (!nodesMap.has(contact.id)) {
          nodesMap.set(contact.id, {
            id: contact.id,
            label: contact.label,
            shape: 'box',
            color: {
              background: '#faf5ff', // purple bg
              border: '#d8b4fe',
              highlight: {
                background: '#f3e8ff',
                border: '#a855f7'
              }
            },
            font: { color: '#581c87', size: 12 },
            margin: 8,
            type: 'contact',
            contactInfo: contact,
            connectedScansCount: 0
          });
        }
        nodesMap.get(contact.id).connectedScansCount += 1;

        edgesList.push({
          from: scanId,
          to: contact.id,
          color: { color: '#c084fc', opacity: 0.6 },
          width: 1
        });
      });
    });

    // Apply dynamic styling based on final connection counts for dark-mode integration
    nodesMap.forEach((node) => {
      if (node.type === 'contact') {
        const isHub = node.connectedScansCount > 1;
        node.color = {
          background: isHub ? '#4c1d95' : '#1e1b4b',
          border: isHub ? '#f43f5e' : '#6366f1',
          highlight: {
            background: isHub ? '#5b21b6' : '#2e1065',
            border: isHub ? '#f43f5e' : '#818cf8'
          }
        };
        node.font = {
          color: isHub ? '#fdf2ff' : '#e0e7ff',
          size: isHub ? 12 : 11,
          bold: isHub,
          face: 'monospace'
        };
        if (isHub) {
          node.borderWidth = 2.5;
          node.label = `🚨 HUB: ${node.label.replace(/^[^\s]+\s/, '')}`;
        } else {
          node.borderWidth = 1;
        }
      } else if (node.type === 'employer') {
        const isHub = node.connectedScansCount > 1;
        node.color = {
          background: '#1e293b',
          border: isHub ? '#f59e0b' : '#475569',
          highlight: {
            background: '#334155',
            border: isHub ? '#f59e0b' : '#64748b'
          }
        };
        node.font = {
          color: '#cbd5e1',
          size: 11,
          bold: true,
          face: 'monospace'
        };
        if (isHub) {
          node.borderWidth = 2;
        }
      } else if (node.type === 'scan') {
        node.font = {
          color: '#e2e8f0',
          size: 11,
          face: 'monospace'
        };
      }
    });

    const nodes = Array.from(nodesMap.values());
    const data = { nodes, edges: edgesList };

    const options = {
      physics: {
        enabled: physicsEnabled,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -50,
          centralGravity: 0.01,
          springLength: 100,
          springConstant: 0.08
        },
        stabilization: {
          iterations: 150,
          updateInterval: 25
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        selectable: true,
        selectConnectedEdges: true
      }
    };

    const network = new Network(containerRef.current, data, options);
    networkRef.current = network;

    // Click handler
    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = nodesMap.get(nodeId);
        
        // Find connected scans for aggregate nodes
        let connectedScans = [];
        if (node.type === 'employer' || node.type === 'contact') {
          edgesList.forEach(edge => {
            if (edge.to === nodeId && edge.from.startsWith('scan_')) {
              const scanNode = nodesMap.get(edge.from);
              if (scanNode) connectedScans.push(scanNode.data);
            }
          });
        }

        setSelectedNode({ ...node, connectedScans });
      } else {
        setSelectedNode(null);
      }
    });

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
      }
    };
  }, [scans, physicsEnabled]);

  const fitGraph = () => {
    if (networkRef.current) {
      networkRef.current.fit({ animation: { duration: 1000 } });
    }
  };

  const handleScanClick = (scan) => {
    navigate('/review', {
      state: {
        ...scan,
        isExistingScan: true
      }
    });
  };

  return (
    <div className="flex flex-col flex-1 bg-[#111318] border border-slate-800 rounded-xl overflow-hidden shadow-sm min-h-[700px]">
      
      {/* Top Details Panel */}
      <div className="border-b border-slate-800 p-4 bg-[#0a0c12]/40 min-h-[120px] flex flex-col justify-center">
        {!selectedNode ? (
          <div className="flex items-center gap-3 text-slate-400">
            <AlertCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <p className="text-sm font-medium">Click any node in the graph below to inspect details, connected scans, and shared contact hubs.</p>
          </div>
        ) : (
          <div className="w-full">
            
            {/* Scan Detail Node */}
            {selectedNode.type === 'scan' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded text-white bg-slate-500 mr-2">
                    Posting
                  </span>
                  <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded text-white ${
                    selectedNode.data.riskScore >= 60 ? 'bg-red-500' : selectedNode.data.riskScore >= 30 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}>
                    {selectedNode.data.riskLevel} ({selectedNode.data.riskScore}%)
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate mt-1">
                    {selectedNode.data.jobTitle || 'Unknown Job'}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">{selectedNode.data.employer || 'Unknown Employer'}</p>
                </div>

                <div className="min-w-0 overflow-x-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Triggered Flags</span>
                  <div className="flex gap-1 overflow-x-auto pb-1 max-w-xs md:max-w-none">
                    {selectedNode.data.activeFlags?.length > 0 ? (
                      selectedNode.data.activeFlags.map(flag => (
                        <span key={flag} className="text-[9px] font-bold bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                          {flag}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">No flags triggered</span>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => handleScanClick(selectedNode.data)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all shadow-sm flex items-center gap-1.5"
                  >
                    View Full Review <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Employer Detail Node */}
            {selectedNode.type === 'employer' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded text-white bg-slate-500">
                    Employer Entity
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate mt-1">
                    {selectedNode.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">{selectedNode.connectedScansCount} job posting{selectedNode.connectedScansCount !== 1 ? 's' : ''}</p>
                </div>

                <div className="min-w-0 col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Connected Postings</span>
                  <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
                    {selectedNode.connectedScans.map(scan => (
                      <div 
                        key={scan.id}
                        onClick={() => handleScanClick(scan)}
                        className="flex-shrink-0 p-1.5 border border-slate-200 dark:border-slate-800 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors flex items-center gap-2"
                      >
                        <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 max-w-[120px] truncate">{scan.jobTitle}</span>
                        <span className={`text-[8px] font-extrabold px-1 py-0.2 rounded text-white ${
                          scan.riskScore >= 60 ? 'bg-red-500' : scan.riskScore >= 30 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}>
                          {scan.riskScore}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Contact Detail Node */}
            {selectedNode.type === 'contact' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded text-white bg-purple-600">
                      Contact Handle
                    </span>
                    {selectedNode.connectedScansCount > 1 && (
                      <span className="text-[9px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/30 flex items-center gap-1">
                        ⚠️ Hub Detected
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate mt-1">
                    {selectedNode.contactInfo.label}
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">Shared across {selectedNode.connectedScansCount} listing{selectedNode.connectedScansCount !== 1 ? 's' : ''}</p>
                </div>

                <div className="min-w-0 col-span-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Associated Scans</span>
                  <div className="flex gap-2 overflow-x-auto pb-1 max-w-full">
                    {selectedNode.connectedScans.map(scan => (
                      <div 
                        key={scan.id}
                        onClick={() => handleScanClick(scan)}
                        className="flex-shrink-0 p-1.5 border border-slate-200 dark:border-slate-800 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors flex items-center gap-2"
                      >
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 max-w-[120px] truncate">{scan.jobTitle}</span>
                          <span className="text-[8px] text-slate-400 truncate">{scan.employer || 'Unknown'}</span>
                        </div>
                        <span className={`text-[8px] font-extrabold px-1 py-0.2 rounded text-white ${
                          scan.riskScore >= 60 ? 'bg-red-500' : scan.riskScore >= 30 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}>
                          {scan.riskScore}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Network Canvas */}
      <div className="flex-1 relative bg-[#0a0c12] min-h-[550px] h-[550px]">
        <div ref={containerRef} className="w-full h-full absolute inset-0" />
        
        {/* Float Controls */}
        <div className="absolute bottom-4 left-4 flex gap-2 z-10">
          <button 
            onClick={fitGraph}
            className="p-2 bg-[#111318] hover:bg-slate-800 text-slate-300 rounded-lg shadow border border-slate-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
          >
            <RotateCcw className="w-4 h-4" /> Recenter
          </button>
          <button 
            onClick={() => setPhysicsEnabled(prev => !prev)}
            className={`p-2 rounded-lg shadow border transition-colors flex items-center gap-1.5 text-xs font-semibold ${
              physicsEnabled 
                ? 'bg-[#111318] hover:bg-slate-800 border-slate-800 text-slate-300' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20'
            }`}
          >
            {physicsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {physicsEnabled ? 'Freeze Physics' : 'Unfreeze Physics'}
          </button>
        </div>
      </div>

    </div>
  );
}
