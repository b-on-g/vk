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

		Auth_block: {
			flex: {
				direction: 'column',
			},
			alignItems: 'center',
			gap: '0.5rem',
			padding: {
				top: '2rem',
				bottom: '1rem',
				left: '1rem',
				right: '1rem',
			},
		},

		Auth_link: {
			background: {
				color: '#0077FF',
			},
			color: '#fff',
			padding: {
				top: '0.75rem',
				bottom: '0.75rem',
				left: '1.5rem',
				right: '1.5rem',
			},
			borderRadius: '0.5rem',
			font: {
				weight: 'bold',
				size: '1rem',
			},
			textDecoration: 'none',
		},

		Auth_hint: {
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
