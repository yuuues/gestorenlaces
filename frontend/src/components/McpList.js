import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './McpList.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTag, faExternalLinkAlt, faFolder } from '@fortawesome/free-solid-svg-icons';

function McpList() {
  const [mcps, setMcps] = useState([]);
  const [selectedMcp, setSelectedMcp] = useState(null);
  const [mcpReadme, setMcpReadme] = useState('');
  const [mcpFiles, setMcpFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);

  // Fetch MCPs on component mount
  useEffect(() => {
    const fetchMcps = async () => {
      try {
        const response = await axios.get('/api/mcps');
        setMcps(response.data);
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch MCPs. Please try again later.');
        console.error('Error fetching MCPs:', err);
        setLoading(false);
      }
    };

    fetchMcps();
  }, []);

  // Fetch MCP details when selected
  useEffect(() => {
    const fetchMcpDetails = async () => {
      if (!selectedMcp) {
        setMcpReadme('');
        setMcpFiles([]);
        return;
      }

      try {
        // Fetch README
        const readmeResponse = await axios.get(`/api/mcps/${selectedMcp.folder}/readme`);
        setMcpReadme(readmeResponse.data);

        // Fetch file list
        const filesResponse = await axios.get(`/api/mcps/${selectedMcp.folder}/files`);
        setMcpFiles(filesResponse.data);
      } catch (err) {
        console.error('Error fetching MCP details:', err);
        setMcpReadme('## Error\n\nNo se pudo cargar el README de este MCP.');
        setMcpFiles([]);
      }
    };

    fetchMcpDetails();
  }, [selectedMcp]);

  // Get all unique tags
  const allTags = [...new Set(mcps.flatMap(mcp => mcp.tags || []))];

  // Filter MCPs based on search and tag
  const filteredMcps = mcps.filter(mcp => {
    const matchesSearch = searchQuery === '' || 
      mcp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mcp.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTag = !selectedTag || (mcp.tags && mcp.tags.includes(selectedTag));

    return matchesSearch && matchesTag;
  });

  const handleMcpClick = (mcp) => {
    setSelectedMcp(mcp);
  };

  const handleBackToList = () => {
    setSelectedMcp(null);
  };

  const handleTagClick = (tag) => {
    setSelectedTag(selectedTag === tag ? null : tag);
  };

  const downloadFile = async (fileName) => {
    try {
      window.open(`/api/mcps/${selectedMcp.folder}/file/${fileName}`, '_blank');
    } catch (err) {
      console.error('Error downloading file:', err);
    }
  };

  // Convert markdown to HTML (basic implementation)
  const renderMarkdown = (markdown) => {
    if (!markdown) return '';
    
    let html = markdown;
    
    // Store code blocks temporarily to protect them from line break processing
    const codeBlocks = [];
    
    // Match code blocks with ``` (including the language specifier if present)
    html = html.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      // Escape HTML entities in code
      const escapedCode = code
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      codeBlocks.push(`<pre><code class="language-${lang || 'plaintext'}">${escapedCode}</code></pre>`);
      return placeholder;
    });
    
    // Store inline code temporarily
    const inlineCodes = [];
    html = html.replace(/`([^`]+)`/g, (match, code) => {
      const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
      inlineCodes.push(`<code>${code}</code>`);
      return placeholder;
    });
    
    // Process tables (and restore inline code within them)
    const tables = [];
    html = html.replace(/(\|.+\|\r?\n\|[-:\s|]+\|\r?\n(?:\|.+\|\r?\n?)+)/gm, (match) => {
      const placeholder = `__TABLE_${tables.length}__`;
      const lines = match.trim().split('\n');
      
      if (lines.length < 2) return match;
      
      // Function to restore inline code in cell content
      const restoreInlineCode = (text) => {
        let result = text;
        inlineCodes.forEach((code, index) => {
          result = result.replace(`__INLINE_CODE_${index}__`, code);
        });
        return result;
      };
      
      // Parse header
      const headerCells = lines[0].split('|').filter(cell => cell.trim()).map(cell => restoreInlineCode(cell.trim()));
      
      // Parse rows (skip separator line at index 1)
      const rows = lines.slice(2).map(line => 
        line.split('|').filter(cell => cell.trim()).map(cell => restoreInlineCode(cell.trim()))
      );
      
      // Build table HTML
      let tableHtml = '<table>';
      tableHtml += '<thead><tr>';
      headerCells.forEach(cell => {
        tableHtml += `<th>${cell}</th>`;
      });
      tableHtml += '</tr></thead>';
      
      tableHtml += '<tbody>';
      rows.forEach(row => {
        tableHtml += '<tr>';
        row.forEach(cell => {
          tableHtml += `<td>${cell}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table>';
      
      tables.push(tableHtml);
      return placeholder;
    });
    
    // Headers (must be on their own line)
    html = html.replace(/^### (.+)$/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gim, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Lists (unordered)
    html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Horizontal rules
    html = html.replace(/^---$/gim, '<hr>');
    
    // Split into lines for better paragraph processing
    const lines = html.split('\n');
    const processedLines = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if we're entering or leaving a list
      if (line.startsWith('<ul>')) inList = true;
      if (line.startsWith('</ul>')) inList = false;
      
      // Skip empty lines
      if (!line) {
        // Add paragraph break only if not in a list and previous line wasn't empty
        if (!inList && processedLines.length > 0 && processedLines[processedLines.length - 1] !== '') {
          processedLines.push('</p><p>');
        }
        continue;
      }
      
      // Don't wrap structural elements in paragraphs
      if (line.match(/^<(h[123]|ul|\/ul|li|table|hr|pre|__)/)) {
        processedLines.push(line);
      } else {
        processedLines.push(line);
      }
    }
    
    html = processedLines.join('');
    
    // Wrap content in paragraph
    html = '<p>' + html + '</p>';
    
    // Clean up: remove p tags around structural elements
    html = html.replace(/<p>(<h[123]>)/g, '$1');
    html = html.replace(/(<\/h[123]>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<table>)/g, '$1');
    html = html.replace(/(<\/table>)<\/p>/g, '$1');
    html = html.replace(/<p>(<hr>)/g, '$1');
    html = html.replace(/(<hr>)<\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\/pre>)<\/p>/g, '$1');
    html = html.replace(/<p>(__[A-Z_]+_\d+__)<\/p>/g, '$1');
    
    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<\/p><p>/g, '</p>\n<p>');
    
    // Restore code blocks
    codeBlocks.forEach((block, index) => {
      html = html.replace(new RegExp(`__CODE_BLOCK_${index}__`, 'g'), block);
    });
    
    // Restore inline code
    inlineCodes.forEach((code, index) => {
      html = html.replace(new RegExp(`__INLINE_CODE_${index}__`, 'g'), code);
    });
    
    // Restore tables
    tables.forEach((table, index) => {
      html = html.replace(new RegExp(`__TABLE_${index}__`, 'g'), table);
    });
    
    return html;
  };

  if (loading) {
    return <div className="mcp-list-container"><div className="loading">Cargando MCPs...</div></div>;
  }

  if (error) {
    return <div className="mcp-list-container"><div className="error-message">{error}</div></div>;
  }

  return (
    <div className="mcp-list-container">
      {!selectedMcp ? (
        <>
          <div className="mcp-list-header">
            <h2>MCPs Disponibles</h2>
            <p className="mcp-subtitle">Explora los Model Context Protocols configurados en la empresa</p>
            
            <div className="mcp-search">
              <input
                type="text"
                placeholder="Buscar MCPs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="mcp-search-input"
              />
            </div>

            {allTags.length > 0 && (
              <div className="mcp-tags-filter">
                <FontAwesomeIcon icon={faTag} className="tags-icon" />
                {allTags.map(tag => (
                  <button
                    key={tag}
                    className={`tag-filter ${selectedTag === tag ? 'active' : ''}`}
                    onClick={() => handleTagClick(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mcp-grid">
            {filteredMcps.map(mcp => (
              <div key={mcp.id} className="mcp-card" onClick={() => handleMcpClick(mcp)}>
                <div className="mcp-card-header">
                  <span className="mcp-icon">{mcp.icon}</span>
                  <h3>{mcp.name}</h3>
                </div>
                <p className="mcp-description">{mcp.description}</p>
                {mcp.tags && mcp.tags.length > 0 && (
                  <div className="mcp-tags">
                    {mcp.tags.map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredMcps.length === 0 && (
            <div className="no-results">
              <p>No se encontraron MCPs que coincidan con tu búsqueda.</p>
            </div>
          )}
        </>
      ) : (
        <div className="mcp-detail">
          <div className="mcp-detail-header">
            <button className="back-button" onClick={handleBackToList}>
              ← Volver al listado
            </button>
            <div className="mcp-detail-title">
              <span className="mcp-icon-large">{selectedMcp.icon}</span>
              <h2>{selectedMcp.name}</h2>
            </div>
          </div>

          <div className="mcp-detail-content">
            <div className="mcp-readme">
              <div 
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(mcpReadme) }}
              />
            </div>

            {mcpFiles.length > 0 && (
              <div className="mcp-files-sidebar">
                <h3>
                  <FontAwesomeIcon icon={faFolder} /> Archivos adicionales
                </h3>
                <ul className="mcp-files-list">
                  {mcpFiles.map(file => (
                    <li key={file}>
                      <button 
                        className="file-link"
                        onClick={() => downloadFile(file)}
                      >
                        <FontAwesomeIcon icon={faExternalLinkAlt} />
                        {file}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default McpList;

