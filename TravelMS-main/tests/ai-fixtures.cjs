const { createAiService } = require('../backend/ai-service');

// Only isolated tests import this provider. The application never uses sample AI responses.
function createTestAi({ onRequest = () => {}, transform = (_kind, value) => value } = {}) {
  return createAiService({
    env: { OPENAI_API_KEY: 'test-only-key', OPENAI_MODEL: 'test-model' },
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body);
      const kind = payload.text.format.name.replace('waypoint_', '');
      const context = JSON.parse(payload.input[0].content[0].text);
      onRequest(kind, context, payload);
      let draft;
      if (kind === 'itinerary') {
        draft = {
          summary:
            'A relaxed draft with time for culture, local food and fresh air. Verify opening hours before traveling.',
          items: ['Museum morning', 'Local food walk', 'Park break'].map((title, index) => ({
            item_date: context.start_date,
            start_time: ['09:00', '12:00', '15:00'][index],
            kind: 'ACTIVITY',
            title,
            location: context.destination,
            notes: 'Check opening hours and availability before traveling.',
          })),
        };
      } else if (kind === 'receipt') {
        draft = {
          merchant: 'Test Cafe',
          amount: 12.5,
          currency: 'USD',
          expense_date: '2027-05-02',
          category: 'FOOD',
          description: 'Lunch at Test Cafe',
          warnings: ['Verify the printed total before applying.'],
        };
      } else {
        draft = {
          summary: `Your recorded spending is USD ${context.spent.toFixed(2)}.`,
          suggestions: ['Review your largest spending category before adding more expenses.'],
        };
      }
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: JSON.stringify(transform(kind, draft)) }],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });
}
module.exports = { createTestAi };
