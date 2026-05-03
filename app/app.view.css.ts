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

		Tools: {
			alignItems: 'center',
		},

		Token_panel: {
			minWidth: '16rem',
			maxWidth: '22rem',
			padding: {
				top: '0.5rem',
				bottom: '0.5rem',
				left: '0.5rem',
				right: '0.5rem',
			},
		},

		Token_input: {
			font: {
				size: '1rem',
			},
		},

		Settings_panel: {
			minWidth: '18rem',
			maxWidth: '24rem',
			padding: {
				top: '0.5rem',
				bottom: '0.5rem',
				left: '0.5rem',
				right: '0.5rem',
			},
		},

		Proxy_input: {
			font: {
				size: '0.875rem',
			},
		},

		Proxy_hint: {
			font: {
				size: '0.8125rem',
			},
			color: $mol_theme.shade,
		},

		Account_panel: {
			minWidth: '18rem',
			maxWidth: '26rem',
			padding: {
				top: '0.5rem',
				bottom: '0.5rem',
				left: '0.5rem',
				right: '0.5rem',
			},
		},

		Account_id: {
			font: {
				family: 'monospace',
				size: '0.875rem',
			},
			padding: {
				top: '0.25rem',
				bottom: '0.25rem',
			},
			gap: '0.5rem',
		},

		Account_warning: {
			font: {
				size: '0.8125rem',
			},
			color: '#d33',
		},

		Account_copy_status: {
			font: {
				size: '0.8125rem',
			},
			color: $mol_theme.shade,
			minHeight: '1rem',
		},

		Player: {
			position: 'sticky',
			bottom: 0,
		},
	})
}
