namespace $.$$ {
	$mol_style_define($bog_vk_app, {
		maxWidth: '50rem',
		margin: {
			left: 'auto',
			right: 'auto',
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

		Search_bar: {
			font: {
				size: '1rem',
			},
			margin: {
				top: '0.25rem',
				bottom: '0.25rem',
				left: '0.5rem',
				right: '0.5rem',
			},
		},

		Token_hint: {
			padding: {
				top: '1rem',
				bottom: '1rem',
				left: '1rem',
				right: '1rem',
			},
			background: {
				color: $mol_theme.card,
			},
			borderRadius: '0.5rem',
			margin: {
				top: '0.5rem',
				bottom: '0.5rem',
				left: '0.5rem',
				right: '0.5rem',
			},
		},

		Token_hint_text: {
			font: {
				size: '0.8125rem',
			},
			color: $mol_theme.shade,
			whiteSpace: 'pre-wrap',
			wordBreak: 'break-all',
		},

		Token_input: {
			maxWidth: '12rem',
			font: {
				size: '1rem',
			},
		},

		Player: {
			position: 'sticky',
			bottom: 0,
		},
	})
}
