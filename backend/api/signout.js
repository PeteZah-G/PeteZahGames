export async function signoutHandler(req, res) {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Failed to sign out' });
    res.clearCookie('pz.sid');
    res.clearCookie('session');
    res.clearCookie('connect.sid');
    res.json({ message: 'Signed out successfully' });
  });
}
