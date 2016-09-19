import * as React from 'react';
import * as ReactDOM from 'react-dom';
import 'whatwg-fetch';

const css = {
    cell: {
        backgroundColor: '#f7f7f7',
        padding: '0.5em',
        textAlign: 'left',
    },
}

class PluginManager extends React.Component {
    constructor(props) {
        super(props);
        this.state = { data: [] };
        fetch('/plugins/').then((res) => {
            return res.json();
        }).then((json) => {
            this.setState({ data: json });
        });
    }
    render() {
        return (
            <div>
                <h1>JavaScriptプラグインマネージャ for ATOK Spark</h1>
                <PluginsTable data={this.state.data} />
            </div>
        );
    }
}

class PluginsTable extends React.Component {
    render() {
        var rows = this.props.data.map((item) => {
            return (
                <Plugin name={item.name} version={item.version} />
            );
        });
        return (
            <table style={{ width: '100%' }}>
                <thead>
                    <tr>
                        <th style={css.cell}>プラグイン名</th>
                        <th style={css.cell}>バージョン</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        );
    }
}

class Plugin extends React.Component {
    render() {
        return (
            <tr>
                <td style={css.cell}>{this.props.name}</td>
                <td style={css.cell}>{this.props.version}</td>
            </tr>
        );
    }
}

ReactDOM.render(
    <PluginManager />,
    document.getElementById('content')
);