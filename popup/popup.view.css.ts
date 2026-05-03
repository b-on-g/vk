namespace $.$$ {
	// В Chrome popup/iframe `html` и `body` стартуют с `width: auto`, что для
	// flex-column root равно 0px — UI схлопывается. Распираем глобально.
	$mol_style_attach('bog/vk/popup/popup.view.css', `
		html, body {
			min-width: 24rem;
			min-height: 32rem;
		}
	`)
}
