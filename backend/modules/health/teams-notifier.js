const axios = require('axios');

const PRESENTATION = {
  opened: {
    title: '🔴 Incidencia detectada',
    color: 'Attention',
    summary: 'Se ha confirmado un fallo tras las comprobaciones configuradas.'
  },
  reminder: {
    title: '🟠 El servicio sigue fallando',
    color: 'Warning',
    summary: 'La incidencia continúa activa.'
  },
  recovered: {
    title: '🟢 Servicio recuperado',
    color: 'Good',
    summary: 'El servicio vuelve a responder correctamente.'
  },
  'resolved-summary': {
    title: '🟢 Incidencia resuelta',
    color: 'Good',
    summary: 'La incidencia ocurrió y ya está resuelta.'
  }
};

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'short',
        timeStyle: 'medium',
        timeZone: 'Europe/Madrid'
      }).format(new Date(value))
    : '—';

const formatDuration = (incident) => {
  const start = Date.parse(incident.first_failed_at);
  const end = Date.parse(
    incident.resolved_at || incident.last_failed_at || incident.first_failed_at
  );
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  return minutes < 1 ? 'menos de 1 min' : `${minutes} min`;
};

const buildFacts = ({ type, incident, server }) => {
  const facts = [
    { title: 'Servidor', value: server.name },
    { title: 'URL', value: server.url },
    { title: 'Inicio', value: formatDate(incident.first_failed_at) },
    { title: 'Duración', value: formatDuration(incident) },
    {
      title: 'Fallos consecutivos',
      value: String(incident.consecutive_failures)
    }
  ];
  const affected = incident.last_error?.components || [];
  if (affected.length > 0) {
    facts.push({
      title: 'Componentes',
      value: affected.join(', ')
    });
  }
  if (type === 'reminder') {
    facts.push({
      title: 'Último aviso',
      value: formatDate(
        incident.last_reminder_at || incident.alert_notified_at
      )
    });
  }
  if (incident.resolved_at) {
    facts.push({
      title: 'Recuperación',
      value: formatDate(incident.resolved_at)
    });
  }
  return facts;
};

const buildAdaptiveCard = (notification) => {
  const presentation = PRESENTATION[notification.type];
  if (!presentation) {
    throw new Error(`Unknown notification type: ${notification.type}`);
  }

  const body = [
    {
      type: 'TextBlock',
      text: presentation.title,
      size: 'Large',
      weight: 'Bolder',
      color: presentation.color,
      wrap: true
    },
    {
      type: 'TextBlock',
      text: presentation.summary,
      wrap: true,
      spacing: 'Small'
    },
    {
      type: 'FactSet',
      facts: buildFacts(notification)
    }
  ];

  if (notification.incident.last_error?.message) {
    body.push({
      type: 'TextBlock',
      text: `**Último error:** ${notification.incident.last_error.message}`,
      wrap: true,
      spacing: 'Medium'
    });
  }

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          msteams: { width: 'Full' },
          body
        }
      }
    ]
  };
};

const createTeamsNotifier = ({
  webhookUrl,
  httpClient = axios,
  timeoutMs = 5000,
  logger = console
}) => {
  const configured =
    typeof webhookUrl === 'string' && webhookUrl.trim().length > 0;

  if (!configured) {
    logger.warn(
      'Avisos de Teams deshabilitados: TEAMS_HEALTH_WEBHOOK_URL no configurada.'
    );
  }

  const send = async (notification) => {
    if (!configured) {
      return { delivered: false, error: 'not_configured' };
    }

    try {
      const response = await httpClient.post(
        webhookUrl,
        buildAdaptiveCard(notification),
        {
          timeout: timeoutMs,
          headers: { 'Content-Type': 'application/json' }
        }
      );
      if (response && response.status >= 400) {
        logger.error(
          `No se pudo enviar la notificación de Teams: HTTP ${response.status}`
        );
        return {
          delivered: false,
          error: `Teams webhook returned HTTP ${response.status}`
        };
      }
      return { delivered: true };
    } catch (error) {
      logger.error(
        `No se pudo enviar la notificación de Teams: ${
          error.response?.status || error.code || 'error de red'
        }`
      );
      return { delivered: false, error: error.message };
    }
  };

  return { configured, send };
};

module.exports = { buildAdaptiveCard, createTeamsNotifier };
