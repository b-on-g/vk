namespace $.$$ {
	$mol_style_define($bog_vk_app, {
		minWidth: '20rem',
		maxWidth: '50rem',
		margin: {
			left: 'auto',
			right: 'auto',
		},
		Head: {
			justifyContent: 'space-between'
		},

		Tabs: {
			flex: {
				direction: 'row',
			},
			gap: '0.25rem',
			padding: {
				top: '0.5rem',
				bottom: '0.25rem',
				left: '0.5rem',
				right: '0.5rem',
			},
		},


		Tools: {
			alignItems: 'center',
		},

		Brand: {
			width: '2rem',
			height: '2rem',
			flex: { shrink: 0, grow: 0 },
			objectFit: 'contain',
			alignSelf: 'center',
			margin: { left: '0.5rem', right: '0.25rem' },
		},

		Nickname_label: {
			font: { size: '0.875rem' },
			color: $mol_theme.shade,
			padding: {
				left: '0.5rem',
				right: '0.5rem',
			},
			maxWidth: '8rem',
			overflow: { x: 'hidden', y: 'hidden' },
			textOverflow: 'ellipsis',
			whiteSpace: 'nowrap',
		},

		Player: {
			position: 'sticky',
			bottom: 0,
		},
	})
}
