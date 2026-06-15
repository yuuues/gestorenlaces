import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import './McpList.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTag, faExternalLinkAlt, faFolder } from '@fortawesome/free-solid-svg-icons';
import { getMcps, getMcpReadme, getMcpFiles, getMcpFileUrl } from '../api';

// Open links rendered from Markdown in a new tab safely.
marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    link(href, title, text) {
      const t = title ? ` title="${title}"` : '';
      return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
  }
});

// Render Markdown to sanitized HTML. DOMPurify neutralizes any XSS in the
// source readme before it reaches dangerouslySetInnerHTML.
const renderMarkdown = (markdown) => {
  if (!markdown) return '';
  return DOMPurify.sanitize(marked.parse(markdown), {
    ADD_ATTR: ['target', 'rel']
  });
};

function McpList() {
  const [mcps, setMcps] = useState([]);
  const [mcpReadme, setMcpReadme] = useState('');
  const [mcpFiles, setMcpFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);

  const { folder } = useParams();
  const navigate = useNavigate();
  const selectedMcp = folder ? mcps.find((m) => m.folder === folder) || null : null;

  // Fetch MCPs on component mount
  useEffect(() => {
    const fetchMcps = async () => {
      try {
        const response = await getMcps();
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
      if (!folder) {
        setMcpReadme('');
        setMcpFiles([]);
        return;
      }
      // Wait until the list is loaded so we can resolve the folder.
      if (mcps.length === 0) return;
      const mcp = mcps.find((m) => m.folder === folder);
      if (!mcp) {
        setMcpReadme('');
        setMcpFiles([]);
        return;
      }
      try {
        const readmeResponse = await getMcpReadme(mcp.folder);
        setMcpReadme(readmeResponse.data);
        const filesResponse = await getMcpFiles(mcp.folder);
        setMcpFiles(filesResponse.data);
      } catch (err) {
        console.error('Error fetching MCP details:', err);
        setMcpReadme('## Error\n\nNo se pudo cargar el README de este MCP.');
        setMcpFiles([]);
      }
    };
    fetchMcpDetails();
  }, [folder, mcps]);

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
    navigate(`/mcps/${mcp.folder}`);
  };

  const handleBackToList = () => {
    navigate('/mcps');
  };

  const handleTagClick = (tag) => {
    setSelectedTag(selectedTag === tag ? null : tag);
  };

  const downloadFile = (fileName) => {
    window.open(getMcpFileUrl(selectedMcp.folder, fileName), '_blank');
  };

  if (loading) {
    return <div className="mcp-list-container"><div className="loading">Cargando MCPs...</div></div>;
  }

  if (error) {
    return <div className="mcp-list-container"><div className="error-message">{error}</div></div>;
  }

  if (folder && mcps.length > 0 && !selectedMcp) {
    return (
      <div className="mcp-list-container">
        <div className="no-results">
          <p>MCP no encontrado.</p>
          <button className="back-button" onClick={handleBackToList}>← Volver al listado</button>
        </div>
      </div>
    );
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
