import React, { useEffect, useRef, useState } from 'react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, AlertTriangle, ArrowRight, ShieldAlert, CheckCircle2, AlertCircle, Play, Pause, Eye, EyeOff, Briefcase, FileSearch } from 'lucide-react';
import { getCleanContactValue } from '../utils/caseHelpers';

const truncateLabel = (s, max) => {
  if (!s) return s;
  return s.length > max ? s.substring(0, max - 1) + '…' : s;
};

const inviteLinkUrl = (code) => `https://t.me/+${code}`;

// Parse contact method to extract clean identifier and type
const parseContacts = (contactStr) => {
  if (!contactStr) return [];
  const str = contactStr.trim();
  const contacts = [];

  // Telegram username / links
  const tgUserMatch = str.match(/(?:t\.me\/|tg:\/\/resolve\?domain=)([a-zA-Z0-9_]{5,32})/i);
  const tgInviteMatch = str.match(/(?:t\.me\/\+|tg:\/\/join\?invite=)([a-zA-Z0-9_-]+)/i);
  const tgRawUser = str.match(/@([a-zA-Z0-9_]{5,32})/);

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

export default function NetworkGraphView({ scans, focusContact = null }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const navigate = useNavigate();
  const [selectedNode, setSelectedNode] = useState(null);
  const [physicsEnabled, setPhysicsEnabled] = useState(true);
  const [showContacts, setShowContacts] = useState(true);
  const [showCompanies, setShowCompanies] = useState(true);
  // When arriving to inspect a specific recruiter cluster, drop the hub
  // threshold so even a 2-ad cluster is visible.
  const [minConnections, setMinConnections] = useState(focusContact ? 1 : 3);
  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0, hubs: 0 });

  // Reset selected node if it gets filtered out
  useEffect(() => {
    if (selectedNode) {
      if (selectedNode.type === 'employer' && !showCompanies) {
        setSelectedNode(null);
      } else if (selectedNode.type === 'contact' && !showContacts) {
        setSelectedNode(null);
      }
    }
  }, [showCompanies, showContacts, selectedNode]);

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

      // Size and color encode risk so hot clusters read at a glance
      const size = scan.riskScore >= 60 ? 17 : scan.riskScore >= 30 ? 13 : 10;

      nodesMap.set(scanId, {
        id: scanId,
        label: truncateLabel(scan.jobTitle || 'Unknown Role', 26),
        title: `Job: ${scan.jobTitle || 'Unknown'}\nRisk Score: ${scan.riskScore}%\nEmployer: ${scan.employer || 'Unknown'}`,
        shape: 'dot',
        size,
        color: {
          background: color,
          border: '#0a0c12',
          highlight: {
            background: color,
            border: '#f8fafc'
          }
        },
        font: { color: fontColor, size: 12 },
        type: 'scan',
        data: scan
      });

      // 2. Employer Node
      if (showCompanies && scan.employer && scan.employer.trim()) {
        const empClean = scan.employer.trim();
        const empId = `emp_${empClean.toLowerCase()}`;

        if (!nodesMap.has(empId)) {
          nodesMap.set(empId, {
            id: empId,
            label: `🏢 ${truncateLabel(empClean, 24)}`,
            title: empClean,
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
          color: { color: '#64748b', opacity: 0.35 },
          width: 1
        });
      }

      // 3. Contact Nodes
      if (showContacts) {
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
            color: { color: '#a855f7', opacity: 0.45 },
            width: 1
          });
        });
      }
    });

    // 1. Initial filter for aggregate nodes based on connections
    const allowedAggregateNodeIds = new Set();
    nodesMap.forEach((node, id) => {
      if (node.type === 'employer' && node.connectedScansCount >= minConnections) {
        allowedAggregateNodeIds.add(id);
      } else if (node.type === 'contact' && node.connectedScansCount >= minConnections) {
        allowedAggregateNodeIds.add(id);
      }
    });

    // 2. Filter edges: must connect to a visible/allowed aggregate node
    const filteredEdgesList = edgesList.filter(edge => 
      allowedAggregateNodeIds.has(edge.to)
    );

    // 3. Collect scan IDs that actually have at least one visible connection
    const connectedScanIds = new Set();
    filteredEdgesList.forEach(edge => {
      connectedScanIds.add(edge.from);
    });

    // 4. Build final filteredNodesMap containing only connected scans and allowed aggregate nodes
    const filteredNodesMap = new Map();
    nodesMap.forEach((node, id) => {
      if (node.type === 'scan') {
        if (connectedScanIds.has(id)) {
          filteredNodesMap.set(id, node);
        }
      } else if (allowedAggregateNodeIds.has(id)) {
        filteredNodesMap.set(id, node);
      }
    });

    // Apply dynamic styling based on final connection counts for dark-mode integration
    filteredNodesMap.forEach((node) => {
      if (node.type === 'contact') {
        const isHub = node.connectedScansCount > 1;
        node.color = {
          background: isHub ? '#4c1d95' : '#1e1b4b',
          border: isHub ? '#a855f7' : '#6366f1',
          highlight: {
            background: isHub ? '#5b21b6' : '#2e1065',
            border: isHub ? '#a855f7' : '#818cf8'
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
          node.label = `HUB: ${node.label.replace(/^[^\s]+\s/, '')}`;
          node.shadow = { enabled: true, color: 'rgba(168,85,247,0.45)', size: 18, x: 0, y: 0 };
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
          node.shadow = { enabled: true, color: 'rgba(245,158,11,0.35)', size: 16, x: 0, y: 0 };
        }
      } else if (node.type === 'scan') {
        node.font = {
          color: '#7d8aa0',
          size: 10,
          face: 'monospace'
        };
      }
    });

    const nodes = Array.from(filteredNodesMap.values());
    const edgesWithIds = filteredEdgesList.map((edge, i) => ({ id: `e_${i}`, ...edge }));
    const nodesDS = new DataSet(nodes);
    const edgesDS = new DataSet(edgesWithIds);

    setGraphStats({
      nodes: nodes.length,
      edges: edgesWithIds.length,
      hubs: nodes.filter(n => n.type !== 'scan' && n.connectedScansCount > 1).length
    });

    const options = {
      nodes: {
        borderWidth: 1.5
      },
      edges: {
        smooth: { enabled: true, type: 'continuous', roundness: 0.4 },
        hoverWidth: 0.5,
        selectionWidth: 1.5
      },
      physics: {
        enabled: physicsEnabled,
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -65,
          centralGravity: 0.012,
          springLength: 130,
          springConstant: 0.06,
          avoidOverlap: 0.7
        },
        stabilization: {
          iterations: 200,
          updateInterval: 25
        }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        selectable: true,
        selectConnectedEdges: true,
        hideEdgesOnDrag: true
      }
    };

    const network = new Network(containerRef.current, { nodes: nodesDS, edges: edgesDS }, options);
    networkRef.current = network;

    // Spotlight a node's neighborhood: everything else fades so a recruiter's
    // web reads instantly, even in a dense graph.
    const spotlight = (centerId) => {
      const neighbors = new Set(network.getConnectedNodes(centerId));
      neighbors.add(centerId);
      nodesDS.update(nodes.map(n => ({ id: n.id, opacity: neighbors.has(n.id) ? 1 : 0.12 })));
      edgesDS.update(edgesWithIds.map(e => {
        const inFocus = e.from === centerId || e.to === centerId;
        return {
          id: e.id,
          color: { ...e.color, opacity: inFocus ? 0.9 : 0.05 },
          width: inFocus ? 2 : 1
        };
      }));
    };

    const clearSpotlight = () => {
      nodesDS.update(nodes.map(n => ({ id: n.id, opacity: 1 })));
      edgesDS.update(edgesWithIds.map(e => ({ id: e.id, color: e.color, width: 1 })));
    };

    // Click handler
    network.on('click', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        const node = filteredNodesMap.get(nodeId);
        spotlight(nodeId);

        // Find connected scans for aggregate nodes
        let connectedScans = [];
        if (node && (node.type === 'employer' || node.type === 'contact')) {
          filteredEdgesList.forEach(edge => {
            if (edge.to === nodeId && edge.from.startsWith('scan_')) {
              const scanNode = filteredNodesMap.get(edge.from);
              if (scanNode) connectedScans.push(scanNode.data);
            }
          });
        }

        setSelectedNode(node ? { ...node, connectedScans } : null);
      } else {
        clearSpotlight();
        setSelectedNode(null);
      }
    });

    // Auto-focus a recruiter cluster when navigated in from a case review.
    if (focusContact) {
      const norm = String(focusContact).toLowerCase().replace(/^@/, '').trim();
      const target = nodes.find(n =>
        n.type === 'contact' && (
          String(n.value ?? '').toLowerCase().replace(/^@/, '').trim() === norm ||
          n.id === `tg_${norm}` ||
          String(n.label ?? '').toLowerCase().includes(norm)
        )
      );
      if (target) {
        network.once('stabilizationIterationsDone', () => {
          spotlight(target.id);
          network.selectNodes([target.id]);
          network.focus(target.id, { scale: 1.05, animation: { duration: 900, easingFunction: 'easeInOutQuad' } });
          let connectedScans = [];
          filteredEdgesList.forEach(edge => {
            if (edge.to === target.id && edge.from.startsWith('scan_')) {
              const scanNode = filteredNodesMap.get(edge.from);
              if (scanNode) connectedScans.push(scanNode.data);
            }
          });
          setSelectedNode({ ...target, connectedScans });
        });
      }
    }

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
      }
    };
  }, [scans, physicsEnabled, showContacts, showCompanies, minConnections, focusContact]);

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
      <div className="border-b border-slate-800 p-5 bg-[#0e121a] min-h-[140px] flex flex-col justify-center transition-all">
        {!selectedNode ? (
          <div className="flex items-center gap-3 text-slate-400">
            <AlertCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <p className="text-sm font-medium">Click any node in the graph below to inspect details, connected scans, and shared contact hubs.</p>
          </div>
        ) : (
          <div className="w-full">
            
            {/* Scan Detail Node */}
            {selectedNode.type === 'scan' && (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                
                {/* Left: Job Info */}
                <div className="flex items-start gap-4 min-w-0 md:max-w-[45%]">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-450 flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-350">
                        Job Posting
                      </span>
                      <span className={`text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded border ${
                        selectedNode.data.riskScore >= 60 
                          ? 'bg-red-500/15 border-red-500/25 text-red-400' 
                          : selectedNode.data.riskScore >= 30 
                            ? 'bg-amber-500/15 border-amber-500/25 text-amber-400' 
                            : 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400'
                      }`}>
                        {selectedNode.data.riskLevel} ({selectedNode.data.riskScore}%)
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white truncate font-mono">
                      {selectedNode.data.jobTitle || 'Unknown Job'}
                    </h3>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{selectedNode.data.employer || 'Unknown Employer'}</p>
                  </div>
                </div>

                {/* Center: Triggered Flags */}
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-2">
                    Triggered Flags
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto pr-1">
                    {selectedNode.data.activeFlags?.length > 0 ? (
                      selectedNode.data.activeFlags.map(flag => (
                        <span 
                          key={flag} 
                          className="text-[9px] font-mono font-bold bg-red-950/20 text-red-400 border border-red-900/30 px-2 py-0.5 rounded"
                        >
                          {flag}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] font-mono text-slate-500">No risk flags detected</span>
                    )}
                  </div>
                </div>

                {/* Right: Action Button */}
                <div className="flex-shrink-0 flex justify-end">
                  <button
                    onClick={() => handleScanClick(selectedNode.data)}
                    className="bg-amber-500 hover:bg-amber-600 text-[#0d1117] font-bold py-2.5 px-4 rounded-lg text-xs transition-all active:scale-[0.97] shadow-lg shadow-amber-500/5 flex items-center gap-1.5 font-mono uppercase tracking-wider"
                  >
                    View Review <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                
              </div>
            )}

            {/* Employer Detail Node */}
            {selectedNode.type === 'employer' && (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                
                {/* Left: Employer Info Card */}
                <div className="flex items-start gap-4 min-w-0 md:max-w-[35%]">
                  <div className="p-3 bg-slate-800/50 border border-slate-700/60 rounded-xl text-slate-350 flex-shrink-0">
                    <Briefcase className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-slate-800/40 border border-slate-700/40 text-slate-450">
                      Employer Entity
                    </span>
                    <h3 className="text-base font-bold text-white truncate font-mono mt-1.5">
                      {selectedNode.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Connected to {selectedNode.connectedScansCount} job posting{selectedNode.connectedScansCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {/* Right: Connected Postings Grid */}
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-2">
                    Connected Postings ({selectedNode.connectedScansCount})
                  </span>
                  
                  <div className="flex flex-wrap gap-2.5 max-h-[160px] overflow-y-auto pr-1">
                    {selectedNode.connectedScans.map(scan => {
                      const isHighRisk = scan.riskScore >= 60;
                      const isMedRisk = scan.riskScore >= 30;
                      const riskColor = isHighRisk ? 'text-red-400 border-red-500/20 bg-red-950/10' : isMedRisk ? 'text-amber-450 border-amber-500/20 bg-amber-950/10' : 'text-[#3fb950] border-[#3fb950]/20 bg-[#3fb950]/5';
                      
                      return (
                        <div 
                          key={scan.id}
                          onClick={() => handleScanClick(scan)}
                          className="flex items-center justify-between gap-3 p-2 bg-[#171a21] hover:bg-[#202530] border border-slate-800 rounded-lg cursor-pointer transition-all duration-200 active:scale-[0.98] group flex-1 min-w-[200px] max-w-[280px]"
                        >
                          <div className="min-w-0 flex-1">
                            <h4 className="text-[11px] font-mono font-bold text-slate-200 group-hover:text-amber-400 transition-colors truncate">
                              {scan.jobTitle || 'Unknown Job'}
                            </h4>
                            <span className="text-[9px] font-mono text-slate-500 truncate block mt-0.5">
                              {scan.employer || 'Unknown Employer'}
                            </span>
                          </div>
                          
                          <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border flex-shrink-0 ${riskColor}`}>
                            {scan.riskScore}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
              </div>
            )}

            {/* Contact Detail Node */}
            {selectedNode.type === 'contact' && (
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                
                {/* Left: Contact Info Card */}
                <div className="flex items-start gap-4 min-w-0 md:max-w-[35%]">
                  <div className="p-3 bg-purple-550/15 border border-purple-500/35 rounded-xl text-purple-400 flex-shrink-0 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-purple-950/40 border border-purple-500/25 text-purple-400">
                        Contact Handle
                      </span>
                      {selectedNode.connectedScansCount > 1 && (
                        <span className="text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-red-950/40 border border-red-500/25 text-red-400 flex items-center gap-1">
                          ⚠️ Hub
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-white truncate font-mono">
                      {selectedNode.contactInfo.label.replace(/^[^\s]+\s/, '')}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      Shared across {selectedNode.connectedScansCount} listing{selectedNode.connectedScansCount !== 1 ? 's' : ''}
                    </p>
                    {(() => {
                      const src = selectedNode.connectedScans?.[0];
                      const dossierKey = src && getCleanContactValue(src.extractedData?.contact_method);
                      return dossierKey ? (
                        <button
                          onClick={() => navigate(`/poster/${encodeURIComponent(dossierKey)}`)}
                          className="mt-2.5 flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1.5 rounded bg-purple-950/40 border border-purple-500/30 text-purple-300 hover:bg-purple-950/70 hover:border-purple-400/50 transition-colors"
                        >
                          <FileSearch className="w-3.5 h-3.5" /> Open Recruiter Dossier
                        </button>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* Right: Associated Scans Grid */}
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest block mb-2">
                    Associated Scans ({selectedNode.connectedScansCount})
                  </span>
                  
                  <div className="flex flex-wrap gap-2.5 max-h-[160px] overflow-y-auto pr-1">
                    {selectedNode.connectedScans.map(scan => {
                      const isHighRisk = scan.riskScore >= 60;
                      const isMedRisk = scan.riskScore >= 30;
                      const riskColor = isHighRisk ? 'text-red-400 border-red-500/20 bg-red-950/10' : isMedRisk ? 'text-amber-450 border-amber-500/20 bg-amber-950/10' : 'text-[#3fb950] border-[#3fb950]/20 bg-[#3fb950]/5';
                      
                      return (
                        <div 
                          key={scan.id}
                          onClick={() => handleScanClick(scan)}
                          className="flex items-center justify-between gap-3 p-2 bg-[#171a21] hover:bg-[#202530] border border-slate-800 rounded-lg cursor-pointer transition-all duration-200 active:scale-[0.98] group flex-1 min-w-[200px] max-w-[280px]"
                        >
                          <div className="min-w-0 flex-1">
                            <h4 className="text-[11px] font-mono font-bold text-slate-200 group-hover:text-amber-400 transition-colors truncate">
                              {scan.jobTitle || 'Unknown Job'}
                            </h4>
                            <span className="text-[9px] font-mono text-slate-500 truncate block mt-0.5">
                              {scan.employer || 'Unknown Employer'}
                            </span>
                          </div>
                          
                          <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border flex-shrink-0 ${riskColor}`}>
                            {scan.riskScore}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
              </div>
            )}

          </div>
        )}
      </div>

      {/* Toolbar — outside the canvas so controls never collide with nodes */}
      <div className="border-b border-slate-800 bg-[#0e121a] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 items-center flex-wrap">
          <button
            onClick={fitGraph}
            className="p-2 bg-[#111318] hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
          >
            <RotateCcw className="w-4 h-4" /> Recenter
          </button>
          <button
            onClick={() => setPhysicsEnabled(prev => !prev)}
            className={`p-2 rounded-lg border transition-colors flex items-center gap-1.5 text-xs font-semibold ${
              physicsEnabled
                ? 'bg-[#111318] hover:bg-slate-800 border-slate-800 text-slate-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-500 hover:bg-amber-500/20'
            }`}
          >
            {physicsEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {physicsEnabled ? 'Freeze Physics' : 'Unfreeze Physics'}
          </button>
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider pl-1 hidden sm:inline">
            {graphStats.nodes} nodes · {graphStats.edges} links · <span className="text-purple-400 font-bold">{graphStats.hubs} hubs</span>
          </span>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          {/* Min Connections Dropdown Filter */}
          <div className="flex items-center gap-1.5 bg-[#111318] border border-slate-800 rounded-lg p-1">
            <span className="text-[9px] font-mono text-slate-400 uppercase pl-1.5 pr-0.5 font-bold">Min Connections:</span>
            <select
              value={minConnections}
              onChange={(e) => setMinConnections(Number(e.target.value))}
              className="bg-[#0a0c12] border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer font-mono"
            >
              <option value={1}>1+ connection</option>
              <option value={2}>2+ connections (Hubs)</option>
              <option value={3}>3+ connections</option>
              <option value={4}>4+ connections</option>
              <option value={5}>5+ connections</option>
            </select>
          </div>
          <button
            onClick={() => setShowContacts(prev => !prev)}
            className={`p-2 rounded-lg border transition-colors flex items-center gap-1.5 text-xs font-semibold ${
              showContacts
                ? 'bg-purple-950/20 border-purple-500/30 text-purple-400 hover:bg-purple-950/45'
                : 'bg-[#111318] hover:bg-slate-850 border-slate-800 text-slate-500'
            }`}
          >
            {showContacts ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            Contacts
          </button>
          <button
            onClick={() => setShowCompanies(prev => !prev)}
            className={`p-2 rounded-lg border transition-colors flex items-center gap-1.5 text-xs font-semibold ${
              showCompanies
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700/80'
                : 'bg-[#111318] hover:bg-slate-850 border-slate-800 text-slate-500'
            }`}
          >
            {showCompanies ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            Companies
          </button>
        </div>
      </div>

      {/* Network Canvas */}
      <div className="flex-1 relative bg-[#0a0c12] min-h-[550px] h-[550px]">
        <div ref={containerRef} className="w-full h-full absolute inset-0" />

        {graphStats.nodes === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center max-w-sm px-6">
              <AlertTriangle className="w-8 h-8 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500 font-mono">
                No linked entities at this filter level.
              </p>
              <p className="text-xs text-slate-600 font-mono mt-1.5">
                Lower “Min Connections” to reveal smaller clusters, or enable Contacts/Companies above.
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
