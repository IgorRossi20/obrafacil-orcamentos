// Config pública do backend (chave anon é pública por desenho).
// Preenchida via variáveis de ambiente no deploy (SUPABASE_URL / SUPABASE_ANON_KEY).
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || ''
  });
};
